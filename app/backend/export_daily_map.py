"""Export one processed UTC day of environmental context for the Explorer."""
import json
from datetime import date
from pathlib import Path

import ee
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds, transform_geom

from environmental_analytics import SOURCES, observations, period_image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "app/frontend/public/data"
SCALES = {"rainfall": (100,"#dcebef","#255793"), "moisture": (1,"#efdbc1","#34736a"), "runoff": (50,"#dcebf5","#325c89")}


def export_daily_map(project, factor, day):
    key = day.isoformat()
    rows = observations()["rows"]
    if not any(r["factor"]==factor and r["date"]==key and r["region"]=="Whole Malaysia" and r["coverage"]>=.95 for r in rows):
        raise ValueError("A complete national observation must be exported first.")
    ee.Initialize(project=project)
    product = period_image(ee, factor, day)
    if product is None:
        raise ValueError("Incomplete source timestamps.")
    value, projection, _, status = product
    boundary = json.loads((ROOT/"data/raw/references/boundary/mys_admin0.geojson").read_text())
    land = [transform_geom("EPSG:4326","EPSG:3857",f["geometry"]) for f in boundary["features"]]
    maximum,low,high=SCALES[factor]
    for region,bounds in [("west",(99,0,105,8)),("east",(109,0,120,8))]:
        extent=transform_bounds("EPSG:4326","EPSG:3857",*bounds)
        w,h=[round((extent[i+2]-extent[i])/10000) for i in (0,1)]
        tr=from_bounds(*extent,w,h)
        result=ee.data.computePixels({"expression":value.setDefaultProjection(projection).unmask(-9999),
            "fileFormat":"GEO_TIFF","grid":{"dimensions":{"width":w,"height":h},"crsCode":"EPSG:3857",
            "affineTransform":{"scaleX":tr.a,"translateX":tr.c,"scaleY":tr.e,"translateY":tr.f}}})
        with MemoryFile(result) as mem, mem.open() as src:
            z=src.read(1)
        mask=geometry_mask(land,(h,w),tr,invert=True)&np.isfinite(z)&(z>=0)
        if not mask.any(): raise ValueError("Empty region")
        scale=np.clip(np.where(mask,z,0)/maximum,0,1)
        with rasterio.open(OUT/f"{factor}-{key}-{region}.png","w",driver="PNG",width=w,height=h,count=4,dtype="uint8") as dst:
            for i in range(3):
                a,b=[int(c[1+i*2:3+i*2],16) for c in (low,high)]
                dst.write((a+(b-a)*scale).astype("uint8"),i+1)
            dst.write(mask.astype("uint8")*255,4)
    manifest=OUT/"environmental-map-dates.json"
    registry=json.loads(manifest.read_text()) if manifest.exists() else {}
    registry.setdefault(factor,{})[key]={"source":SOURCES[factor][0],"status":status,"unit":SOURCES[factor][2],"maximum":maximum,"colors":[low,high]}
    temporary=manifest.with_suffix(".tmp")
    temporary.write_text(json.dumps(registry,indent=2))
    temporary.replace(manifest)
