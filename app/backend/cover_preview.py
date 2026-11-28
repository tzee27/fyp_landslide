"""Render cached categorical exports on their Web Mercator overview grids."""
import io
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio
from fastapi import HTTPException, Response
from PIL import Image
from rasterio.features import geometry_mask, geometry_window, rasterize
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds, transform_geom
from rasterio.windows import Window, bounds as window_bounds
from types import SimpleNamespace

from environmental_analytics import OUTPUT, REFERENCE_DIR

FRONT = Path(__file__).resolve().parents[1]/"frontend"
DATA = FRONT/"public/data"
CRS = "EPSG:3857"

@lru_cache(maxsize=1)
def boundaries():
    states=json.loads((REFERENCE_DIR/"gaul-2015-states.geojson").read_text())["features"]
    return {s["properties"]["name"]:transform_geom("EPSG:4326",CRS,s["geometry"]) for s in states}

def sources(product,year):
    if product=="dynamic":
        directory=OUTPUT.parent/"dynamic-world"
        meta=directory/f"{year}.json"
        if meta.exists():
            path=directory/json.loads(meta.read_text())["raster"]
            if path.is_file(): return ((str(path),None,path.stat().st_mtime_ns),)
    if product=="glc":
        paths=[(DATA/f"cover-{year}-{part}.png",bounds) for part,bounds in
               [("west",(99,0,105,8)),("east",(109,0,120,8))]]
        if all(p.exists() for p,_ in paths): return tuple((str(p),b,p.stat().st_mtime_ns) for p,b in paths)
    raise HTTPException(404,"Processed land-cover map unavailable")

@lru_cache(maxsize=12)
def preview(files,region):
    if region!="Whole Malaysia" and region not in boundaries(): raise HTTPException(422,"Unknown geography")
    parts=[]
    area=0.
    for path,extent,_ in files:
        with rasterio.open(path) as src:
            tr=from_bounds(*transform_bounds("EPSG:4326",CRS,*extent),src.width,src.height) if extent else src.transform
            if extent:
                rgba=src.read().transpose(1,2,0).copy()
            else:
                palette=json.loads((FRONT/"src/services/dynamicCoverClasses.json").read_text())
                lookup=np.zeros((256,4),dtype="uint8")
                for c in palette: lookup[c["code"]]=[*bytes.fromhex(c["color"][1:]),255]
                rgba=lookup[src.read(1)]
            if region!="Whole Malaysia":
                shape=boundaries()[region]
                if extent:
                    rgba[:,:,3]*=geometry_mask([shape],rgba.shape[:2],tr,invert=True)
                else:
                    zones=rasterize([(g,i) for i,g in enumerate(boundaries().values(),1)],out_shape=rgba.shape[:2],transform=tr,dtype="uint8")
                    rgba[:,:,3]*=zones==list(boundaries()).index(region)+1
                try: win=geometry_window(SimpleNamespace(transform=tr,width=src.width,height=src.height),[shape])
                except rasterio.errors.WindowError: continue
            else: win=Window(0,0,src.width,src.height)
            ys,xs=win.toslices()
            rgba=rgba[ys,xs]
            coords=window_bounds(win,tr)
            weights=abs(tr.a*tr.e)/1e6/np.cosh((coords[3]+(np.arange(rgba.shape[0])+.5)*tr.e)/6378137)**2
            area+=float(np.dot((rgba[:,:,3]>0).sum(axis=1),weights))
            parts.append((coords,Image.fromarray(rgba)))
    if not parts: raise HTTPException(404,"No map extent for this geography")
    left=min(b[0] for b,_ in parts); right=max(b[2] for b,_ in parts)
    bottom=min(b[1] for b,_ in parts); top=max(b[3] for b,_ in parts)
    scale=max((right-left)/1500,(top-bottom)/800,1)
    canvas=Image.new("RGBA",(max(1,round((right-left)/scale)),max(1,round((top-bottom)/scale))))
    for b,img in parts:
        size=(max(1,round((b[2]-b[0])/scale)),max(1,round((b[3]-b[1])/scale)))
        canvas.paste(img.resize(size,Image.Resampling.NEAREST),(round((b[0]-left)/scale),round((top-b[3])/scale)))
    stream=io.BytesIO()
    canvas.save(stream,format="PNG")
    west,south,east,north=transform_bounds(CRS,"EPSG:4326",left,bottom,right,top)
    return {"coordinates":[[west,north],[east,north],[east,south],[west,south]],"areaKm2":area},stream.getvalue()

def cover_preview(product:str,year:int,kind:str,region:str="Whole Malaysia"):
    files=sources(product,year)
    meta,image=preview(files,region)
    if kind=="metadata": return meta
    if kind=="image": return Response(image,media_type="image/png")
    raise HTTPException(404)
