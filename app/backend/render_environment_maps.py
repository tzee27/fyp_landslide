"""Build clipped 1 km display rasters from verified local SoilGrids and SRTM bands."""
import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds, transform_geom

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "data/raw/references"
OUTPUT = ROOT / "app/frontend/public/data"
boundary = json.loads((BASE / "boundary/mys_admin0.geojson").read_text())
land = [transform_geom("EPSG:4326", "EPSG:3857", f["geometry"]) for f in boundary["features"]]
layers = [
    ("clay", "Clay", "#f3e4c9", "#65392c"),
    ("sand", "Sand", "#fff1ba", "#aa6716"),
    ("silt", "Silt", "#e5edcf", "#386347"),
    ("bdod", "Bulk_Density", "#d6eff0", "#156076"),
    ("slope", None, "#e8efb1", "#b34420"),
]
parser=argparse.ArgumentParser()
parser.add_argument("--terrain-only", action="store_true")
parser.add_argument("--cover-only",action="store_true")
args=parser.parse_args()
terrain_only=args.terrain_only
state_file=ROOT/"data/dashboard/environmental/gaul-2015-states.geojson"
states=json.loads(state_file.read_text())["features"]
composition={}

def add_composition(year, codes, zones, weights):
    for name,mask in zones.items():
        record=composition.setdefault((int(year),name),np.zeros(257))
        record[:256]+=np.bincount(codes[mask],weights=weights[mask],minlength=256)
        record[256]+=weights[mask].sum()

for region, bounds in [("west", (99,0,105,8)), ("east", (109,0,120,8))]:
    extent = transform_bounds("EPSG:4326", "EPSG:3857", *bounds)
    w,h = [round((extent[i+2]-extent[i])/1000) for i in (0,1)]
    transform = from_bounds(*extent,w,h)
    inside = geometry_mask(land,(h,w),transform,invert=True)
    if not terrain_only:
        zones={"Whole Malaysia":inside}
        for state in states:
            outline=transform_geom("EPSG:4326","EPSG:3857",state["geometry"])
            zones[state["properties"]["name"]]=inside & geometry_mask([outline],(h,w),transform,invert=True)
        lat=np.arctan(np.sinh((extent[3]+(np.arange(h)+.5)*transform.e)/6378137))
        weights=np.broadcast_to((np.cos(lat[:,None])**2)*abs(transform.a*transform.e),(h,w))
        # Annual categorical overviews use nearest-neighbour lookup to preserve class IDs.
        classes=json.loads((ROOT/"app/frontend/src/services/landCoverClasses.json").read_text())
        lookup=np.zeros((256,4),dtype="uint8")
        for entry in classes:
            lookup[entry["code"]]=[*bytes.fromhex(entry["color"][1:]),255]
        # Product guide: three five-year snapshots, then 23 annual bands.
        archives=[("*5years*.tif",[1985,1990,1995]),("*Annual*.tif",list(range(2000,2023)))]
        from rasterio.vrt import WarpedVRT
        for pattern, years in archives:
            stack=np.zeros((len(years),h,w),dtype="uint8")
            for path in sorted((BASE/"landcover/GLC_FCS30D").glob(pattern)):
                with rasterio.open(path) as src:
                    if src.count!=len(years) or src.crs.to_epsg()!=4326: raise ValueError(path)
                    left,bottom,right,top=src.bounds
                    if right<=bounds[0] or left>=bounds[2] or top<=bounds[1] or bottom>=bounds[3]: continue
                    with WarpedVRT(src,crs="EPSG:3857",width=w,height=h,transform=transform,
                                   resampling=Resampling.nearest,nodata=0) as vrt:
                        for i,tile in enumerate(vrt.read()):
                            valid=inside & (lookup[tile,3]>0)
                            stack[i,valid]=tile[valid]
            for year,codes in zip(years,stack,strict=True):
                if not codes.any(): raise ValueError(f"Missing {region} land-cover map for {year}")
                add_composition(year,codes,zones,weights)
                with rasterio.open(OUTPUT/f"cover-{year}-{region}.png","w",driver="PNG",width=w,height=h,count=4,dtype="uint8") as dst:
                    dst.write(lookup[codes].transpose(2,0,1))
    if args.cover_only: continue
    for key,folder,low,high in layers:
        if terrain_only and key!="slope": continue
        values = np.full((h,w),np.nan,np.float32)
        files = (BASE/"terrain/srtm").glob("*.tif") if not folder else (BASE/"soil"/folder).glob("*.tif")
        national=ROOT/"data/dashboard/environmental/terrain"/f"srtm-{region}.tif"
        if not folder and national.exists(): files=[national]
        for path in files:
            with rasterio.open(path) as src:
                if folder and "0-5cm" not in src.descriptions[0]:
                    raise ValueError(path)
                reproject(rasterio.band(src,1),values,dst_transform=transform,dst_crs="EPSG:3857",
                          dst_nodata=np.nan,init_dest_nodata=False,resampling=Resampling.average)
        if key=="slope":
            dy,dx=np.gradient(values,abs(transform.e),transform.a)
            lat=np.arctan(np.sinh((extent[3]+(np.arange(h)+.5)*transform.e)/6378137))
            for terrain_key,arr,stops,colors in [
                ("aspect",(np.degrees(np.arctan2(-dx,dy))+360)%360,[0,90,180,270,360],
                 ["#436a9b","#d7af67","#ac6355","#658b72","#436a9b"]),
                ("curvature",(np.gradient(dx,transform.a,axis=1)+np.gradient(dy,abs(transform.e),axis=0))/np.cos(lat[:,None])**2,
                 [-.0003,0,.0003],["#805a92","#f5efd9","#427e71"])
            ]:
                ok=inside & np.isfinite(arr)
                if terrain_key=="aspect": ok &= np.hypot(dx,dy)>0
                rgb=np.array([list(bytes.fromhex(color[1:])) for color in colors])
                with rasterio.open(OUTPUT/f"{terrain_key}-{region}.png","w",driver="PNG",width=w,height=h,count=4,dtype="uint8") as dst:
                    for channel in range(3):
                        dst.write(np.where(ok,np.interp(arr,stops,rgb[:,channel]),0).astype("uint8"),channel+1)
                    dst.write(ok.astype("uint8")*255,4)
            values=np.degrees(np.arctan(np.hypot(dx,dy)/np.cos(lat[:,None])))
            maximum=90
        else:
            maximum=3 if key=="bdod" else 100
            values/=100 if key=="bdod" else 10
        mask=inside & np.isfinite(values) & (values>=(.1 if key=="bdod" else 0)) & (values<=maximum)
        if not mask.any(): raise ValueError(f"No valid {key} pixels in {region}")
        scale=np.where(mask,values/maximum,0)
        with rasterio.open(OUTPUT/f"{key}-{region}.png","w",driver="PNG",width=w,height=h,count=4,dtype="uint8") as dst:
            for i in range(3):
                a,b=[int(c[1+i*2:3+i*2],16) for c in (low,high)]
                dst.write((a+(b-a)*scale).astype("uint8"),i+1)
            dst.write(mask.astype("uint8")*255,4)

if terrain_only:
    raise SystemExit(0)
records=[]
for (year,name),counts in sorted(composition.items()):
    measured=sum(counts[c["code"]] for c in classes)
    coverage=min(1.0,measured/counts[256]) if counts[256] else 0
    shares={str(c["code"]):round(100*counts[c["code"]]/measured,5) for c in classes if measured and counts[c["code"]]}
    records.append(dict(year=year,region=name,coverage=coverage,shares=shares))
payload={"source":"GLC_FCS30D","boundary":"FAO/GAUL/2015/level1","resolutionMetres":1000,
         "refreshedAt":datetime.now(UTC).isoformat(),"rows":records}
target=OUTPUT/"land-cover-composition.json"
temporary=target.with_suffix(".tmp")
temporary.write_text(json.dumps(payload,separators=(",",":"),allow_nan=False))
temporary.replace(target)