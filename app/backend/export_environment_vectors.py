"""Prepare simplified Malaysian reference vectors for the dashboard overview."""
from pathlib import Path
import json

import numpy as np
from pyogrio.raw import read
from pyproj import Transformer
import shapely

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/"data/raw/references"
OUT=ROOT/"app/frontend/public/data"
land=shapely.union_all([shapely.from_geojson(json.dumps(f["geometry"])) for f in json.loads((BASE/"boundary/mys_admin0.geojson").read_text())["features"]])
land=shapely.make_valid(land)
shapely.prepare(land)
for key,pattern,where,column in [
    ("roads","roads/*/*.shp","fclass IN ('motorway','trunk')","fclass"),
    ("rivers","waterways/*.shp","fclass = 'river'","fclass"),
    ("faults","geology/Faults/*.shp",None,"FNM"),
    ("geology","geology/Lithology/*.shp",None,"FNM"),
]:
    items=[]
    for path in sorted(BASE.glob(pattern)):
        meta,_,wkb,fields=read(path,where=where,columns=[column],force_2d=True)
        geom=shapely.from_wkb(wkb)
        project=Transformer.from_crs(meta["crs"],4326,always_xy=True)
        geom=shapely.transform(geom,project.transform,interleaved=False)
        geom=shapely.simplify(shapely.make_valid(geom),.001)
        overlap=shapely.intersects(land,geom)
        geom,labels=geom[overlap],np.asarray(fields[0])[overlap]
        crossed=~shapely.contains(land,geom)
        geom[crossed]=shapely.intersection(geom[crossed],land)
        for shape,label in zip(geom,labels):
            for part in shapely.get_parts(shape):
                if part.is_empty or part.geom_type not in ("LineString","Polygon"): continue
                shape_json=json.loads(shapely.to_geojson(shapely.set_precision(part,.00001)))
                if shape_json["coordinates"]:
                    items.append({"type":"Feature","properties":{"class":label},"geometry":shape_json})
    if not items: raise ValueError(key)
    (OUT/f"{key}.geojson").write_text(json.dumps({"type":"FeatureCollection","features":items},separators=(",",":")))
    print(key,len(items),{f["properties"]["class"] for f in items},flush=True)
