from pathlib import Path
import json
import numpy as np
import rasterio as rio
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds,reproject,Resampling
base=Path("data/raw/references")
boundary=json.loads((base/"boundary/mys_admin0.geojson").read_text())["features"]
from rasterio.warp import transform_geom
geoms=[transform_geom("EPSG:4326","EPSG:3857",f["geometry"]) for f in boundary]
stops=[0,100,500,1000,2000,4100]
colors=[[48,119,83],[141,180,100],[240,215,123],[198,139,69],[147,85,60],[249,247,232]]
for region,bounds in [("west",(99,0,105,8)),("east",(109,0,120,8))]:
    extent=transform_bounds("EPSG:4326","EPSG:3857",*bounds)
    w,h=[round((extent[i+2]-extent[i])/500) for i in (0,1)]
    tr=from_bounds(*extent,w,h)
    z=np.full((h,w),np.nan,np.float32)
    for tile in (base/"terrain/srtm").glob("*.tif"):
        with rio.open(tile) as src:
            if src.bounds.right<bounds[0] or src.bounds.left>bounds[2]: continue
            reproject(rio.band(src,1),z,dst_transform=tr,dst_crs="EPSG:3857",dst_nodata=np.nan,init_dest_nodata=False,resampling=Resampling.average)
    mask=np.isfinite(z)&geometry_mask(geoms,(h,w),tr,invert=True)
    z=np.nan_to_num(z)
    dy,dx=np.gradient(z,500)
    shade=np.clip(1+0.45*(dy-dx),.72,1.18)
    out=Path("app/frontend/public/data")/f"terrain-{region}.png"
    with rio.open(out,"w",driver="PNG",width=w,height=h,count=4,dtype="uint8") as dst:
        for i in range(3): dst.write(np.where(mask,np.clip(np.interp(z,stops,np.array(colors)[:,i])*shade,0,255),0).astype("uint8"),i+1)
        dst.write(mask.astype("uint8")*255,4)
    print(region,mask.sum())
