"""Cache national SRTM display grids from the same Earth Engine DEM as the model."""
from pathlib import Path
import numpy as np
import rasterio as rio
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds
import ee

CACHE=Path(__file__).resolve().parents[2]/"data/dashboard/environmental/terrain"
def fetch(project):
    ee.Initialize(project=project)
    CACHE.mkdir(parents=True,exist_ok=True)
    dem=ee.Image("USGS/SRTMGL1_003").select("elevation").reduceResolution(reducer=ee.Reducer.mean(),maxPixels=1024).unmask(-9999)
    for region,bounds in [("west",(99,0,105,8)),("east",(109,0,120,8))]:
        path=CACHE/f"srtm-{region}.tif"
        if path.exists(): continue
        extent=transform_bounds("EPSG:4326","EPSG:3857",*bounds)
        w,h=[round((extent[i+2]-extent[i])/500) for i in (0,1)]
        tr=from_bounds(*extent,w,h)
        pending=path.with_suffix(".tmp")
        with rio.open(pending,"w",driver="GTiff",height=h,width=w,count=1,dtype="float32",crs="EPSG:3857",transform=tr,nodata=-9999,compress="deflate") as dst:
            dst.update_tags(source="USGS/SRTMGL1_003", band="elevation", units="m", aggregation="mean")
            for y in range(0,h,192):
                for x in range(0,w,192):
                    width,height=min(192,w-x),min(192,h-y)
                    data=ee.data.computePixels({"expression":dem,"fileFormat":"GEO_TIFF","grid":{"dimensions":{"width":width,"height":height},"crsCode":"EPSG:3857","affineTransform":{"scaleX":tr.a,"scaleY":tr.e,"translateX":tr.c+x*tr.a,"translateY":tr.f+y*tr.e}}})
                    with MemoryFile(data) as mem, mem.open() as src:
                        dst.write(src.read(1).astype(np.float32),1,window=rio.windows.Window(x,y,width,height))
        pending.replace(path)
        print(region,flush=True)
if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--project",required=True)
    fetch(parser.parse_args().project)
