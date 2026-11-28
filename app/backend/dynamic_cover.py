"""Annual Dynamic World overview exports on an latitude-weighted 1 km sampling grid."""
import json
import os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import ee
import numpy as np
import rasterio
import requests
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import transform_geom
from shapely.geometry import shape
from environmental_analytics import OUTPUT, REFERENCE_DIR, initialize_earth_engine

ASSET = "GOOGLE/DYNAMICWORLD/V1"
PROBS = ["water","trees","grass","flooded_vegetation","crops","shrub_and_scrub","built","bare","snow_and_ice"]
DIR = OUTPUT.parent / "dynamic-world"
CRS = "EPSG:3857"
STEP = 1000

def confident(img):
    return img.select("label").updateMask(img.select(PROBS).reduce(ee.Reducer.max()).gte(.6))

def refresh(project, year):
    initialize_earth_engine(ee, project)
    DIR.mkdir(exist_ok=True,parents=True)
    states = json.loads((REFERENCE_DIR/"gaul-2015-states.geojson").read_text())["features"]
    shapes = [shape(transform_geom("EPSG:4326",CRS,f["geometry"])) for f in states]
    names = [f["properties"]["name"] for f in states]
    country = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(ee.Filter.eq("ADM0_NAME","Malaysia")).geometry()
    now = datetime.now(UTC)
    end = min(now.isoformat(),f"{year+1}-01-01")
    source = ee.ImageCollection(ASSET).filterBounds(country).filterDate(f"{year}-01-01",end)
    ids = sorted(source.aggregate_array("system:index").getInfo())
    if not ids: raise ValueError("No Dynamic World imagery")
    source_check=DIR/f"source-{year}.json"
    check_tmp=source_check.with_suffix(".tmp")
    check_tmp.write_text(json.dumps({"latest":datetime.strptime(ids[-1][:8],"%Y%m%d").date().isoformat(),"checkedAt":now.isoformat()}))
    os.replace(check_tmp,source_check)
    # One acquisition per tile and month limits repeat-pass bias. Use the last available acquisition.
    selected = {}
    for identifier in ids:
        selected[identifier[-6:],identifier[:6]] = identifier
    signature = sorted(selected.values())
    dest = DIR/f"{year}.json"
    cached = json.loads(dest.read_text()) if dest.exists() else {}
    if cached.get("images")==signature and cached.get("ytd")==(year==now.year): return
    months = defaultdict(list)
    for identifier in signature: months[identifier[:6]].append(identifier)
    monthly = [ee.ImageCollection.fromImages([ee.Image(ASSET+"/"+key) for key in sorted(items)]).map(confident).mosaic() for items in months.values()]
    stack = ee.ImageCollection.fromImages(monthly)
    result = stack.mode().updateMask(stack.count().gte(3)).unmask(255,False).toByte()
    xmin,ymin,xmax,ymax = np.array([g.bounds for g in shapes]).T
    left,top = int(np.floor(xmin.min()/STEP))*STEP,int(np.ceil(ymax.max()/STEP))*STEP
    w,h = int(np.ceil((xmax.max()-left)/STEP)),int(np.ceil((top-ymin.min())/STEP))
    transform = from_origin(left,top,STEP,STEP)
    zones = rasterize([(g,i+1) for i,g in enumerate(shapes)],out_shape=(h,w),transform=transform,dtype="uint8")
    out = np.full((h,w),255,dtype="uint8")
    def download(box):
        y,x = box
        height,width = min(256,h-y),min(256,w-x)
        mask=zones[y:y+height,x:x+width]>0
        if not mask.any(): return
        affine = [STEP,0,left+x*STEP,0,-STEP,top-y*STEP]
        url=result.getDownloadURL({"crs":CRS,"crs_transform":affine,"dimensions":[width,height],"format":"NPY"})
        response=requests.get(url,timeout=180)
        response.raise_for_status()
        import io
        data=np.load(io.BytesIO(response.content),allow_pickle=False)
        tile=data[data.dtype.names[0]]
        if tile.shape != mask.shape or not np.isin(tile,[*range(9),255]).all(): raise ValueError("Unexpected class raster")
        out[y:y+height,x:x+width][mask]=tile[mask]
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(download,[(y,x) for y in range(0,h,256) for x in range(0,w,256)]))
    weights=np.broadcast_to(1/np.cosh((top-(np.arange(h)+.5)*STEP)/6378137)**2,(w,h)).T
    rows=[]
    for i,name in enumerate(["Whole Malaysia",*names]):
        mask=zones==i if i else zones>0
        valid=out[mask & (out<9)]
        shares=(np.bincount(valid,weights=weights[mask & (out<9)],minlength=9)*100/weights[mask & (out<9)].sum()).tolist() if len(valid) else []
        if shares and abs(sum(shares)-100)>.0001: raise ValueError(name)
        rows.append(dict(region=name,coverage=weights[mask & (out<9)].sum()/weights[mask].sum() if mask.any() else 0,shares=shares))
    if not rows[0]["shares"]: raise ValueError("No valid Malaysian classifications")
    stamp=ids[-1][:8]
    through=f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}"
    raster=f"{year}-{stamp}.tif"
    temp=DIR/f"{year}.tmp.tif"
    with rasterio.open(temp,"w",driver="GTiff",width=w,height=h,count=1,dtype="uint8",crs=CRS,transform=transform,nodata=255,compress="deflate") as dst:
        dst.write(out,1)
    os.replace(temp,DIR/raster)
    payload=dict(year=year,source=ASSET,start=f"{year}-01-01",through=through,ytd=year==now.year,refreshedAt=now.isoformat(),images=signature,raster=raster,rows=rows)
    temp=dest.with_suffix(".tmp")
    temp.write_text(json.dumps(payload))
    os.replace(temp,dest)
    print(year,through,rows[0],flush=True)

if __name__=="__main__":
    import sys
    for year in map(int,sys.argv[1:]): refresh(os.getenv("EARTH_ENGINE_PROJECT","fyplandslide"),year)

def refresh_dynamic_world():
    """One publisher per deployment, including deployments with several API processes."""
    import sqlite3
    from contextlib import closing
    from datetime import timedelta
    DIR.mkdir(parents=True,exist_ok=True)
    with closing(sqlite3.connect(DIR/"worker.sqlite",timeout=0)) as lease:
        try:
            lease.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError:
            return
        status=DIR/"refresh.json"
        now=datetime.now(UTC)
        previous=json.loads(status.read_text()) if status.exists() else {}
        if previous and now-datetime.fromisoformat(previous["checkedAt"])<timedelta(minutes=15 if previous["state"]=="error" else 360):
            return
        record={**previous,"checkedAt":now.isoformat(),"state":"checking"}
        def save():
            tmp=status.with_suffix(".tmp")
            tmp.write_text(json.dumps(record))
            os.replace(tmp,status)
        save()
        try:
            for year in range(now.year,2022,-1):
                path=DIR/f"{year}.json"
                if year==now.year or not path.exists() or json.loads(path.read_text())["ytd"]:
                    refresh(os.getenv("EARTH_ENGINE_PROJECT","fyplandslide"),year)
            record.update(state="complete",lastSuccess=datetime.now(UTC).isoformat())
        except Exception:
            record["state"]="error"
            raise
        finally:
            save()
