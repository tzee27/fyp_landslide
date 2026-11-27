"""Recover missing native-scale terrain predictors for the published 10 km assessment."""
import argparse
import json
import shutil
from tempfile import TemporaryDirectory
from uuid import uuid4
from pathlib import Path

import ee
import numpy as np
import pandas as pd

from national_static import NATIONAL, summary, write_json
from environmental_analytics import export_reference_points
from sample_static_pilot import STATIC, digest, quadratic
from score_static_pilot import publish

ROOT=NATIONAL/"2023-01-01-10000"
CURVE=["profile_curvature_m_inv","plan_curvature_m_inv"]
HYDRO=["merit_upstream_area_km2","topographic_wetness_index"]

def sample_windows(rows, zone, source, spacing, names):
    crs=f"EPSG:{32600+zone}"
    dem=source.select(0).resample("bilinear").reproject(crs,scale=spacing)
    image=dem.unmask(-9999).neighborhoodToArray(ee.Kernel.square(2)).rename("height")
    if names==HYDRO:
        image=image.addBands(source.select("upa").rename("area"))
    found={}
    for i in range(0,len(rows),80):
        batch=rows.iloc[i:i+80]
        points=ee.FeatureCollection([ee.Feature(ee.Geometry.Point([r.longitude,r.latitude]),{"id":r.cell_id}) for r in batch.itertuples()])
        features=image.sampleRegions(collection=points,properties=["id"],projection=dem.projection(),tileScale=4).getInfo()["features"]
        for item in features:
            p=item["properties"]
            z=np.asarray(p["height"])
            if z.shape!=(5,5) or not np.isfinite(z).all() or (z==-9999).any(): continue
            profile,plan,slope=quadratic(z,spacing)
            if names==CURVE:
                values=[profile,plan]
            else:
                area=p["area"]
                if area<=0: continue
                values=[area,np.log(max(area*1e6,spacing**2)/spacing/max(np.tan(slope),np.tan(np.radians(.5))))]
            if np.isfinite(values).all(): found[p["id"]]=dict(zip(names,values))
    return found

def repair(project):
    ee.Initialize(project=project)
    frames=[]
    for path in ROOT.glob("*/static_features.csv"):
        table=pd.read_csv(path,dtype={"landcover_pre_event_class":str},float_precision="round_trip")
        frames.append(table)
    rows=pd.concat(frames)
    updates={}
    for zone,group in rows.groupby((np.floor((rows.longitude+180)/6)+1).astype(int)):
        for source,spacing,names in [(ee.Image("USGS/SRTMGL1_003"),30,CURVE),(ee.Image("MERIT/Hydro/v1_0_1").select(["elv","upa"]),90,HYDRO)]:
            missing=group[names].isna().any(axis=1)
            if names==CURVE: missing &= group.curvature_status!="FLAT_BELOW_0.5_DEG"
            for cell,values in sample_windows(group[missing],zone,source,spacing,names).items():
                updates.setdefault(cell,{}).update(values)
    for path in sorted(ROOT.glob("*/static_features.csv")):
        tile=path.parent
        audit=json.loads((tile/"static_feature_coverage.json").read_text())
        if audit["feature_table_sha256"]!=digest(path): raise ValueError(path)
        table=pd.read_csv(path,dtype={"landcover_pre_event_class":str},float_precision="round_trip")
        fixes=0
        for idx,row in table.iterrows():
            for name,value in updates.get(row.cell_id,{}).items():
                if pd.isna(row[name]):
                    table.at[idx,name]=value
                    if name in CURVE: table.at[idx,"curvature_status"]="MEASURED"
                    fixes+=1
        if not fixes: continue
        table["missing_features"]=table[STATIC].isna().apply(lambda r:";".join(r.index[r]),axis=1)
        with TemporaryDirectory(dir=ROOT) as temp:
            stage=Path(temp)
            shutil.copy2(tile/"static_grid.geojson",stage/"static_grid.geojson")
            table.to_csv(stage/path.name,index=False)
            audit.update(feature_table_sha256=digest(stage/path.name),observed_cells_by_feature=table[STATIC].count().to_dict(),complete_cells=int(table[STATIC].notna().all(axis=1).sum()),terrain_recovery="SRTMGL1_003 / MERIT Hydro v1_0_1; 5x5 UTM windows at 30 / 90 m")
            audit["diagnostics"]["curvature_status"]=table.curvature_status.value_counts().to_dict()
            write_json(stage/"static_feature_coverage.json",audit)
            result=publish(stage)
            old=json.loads((tile/"static_assessment.geojson").read_text())
            for a,b in zip(old["features"],result["features"],strict=True):
                if a["id"]!=b["id"] or (a["properties"]["score"] is not None and not np.isclose(a["properties"]["score"],b["properties"]["score"])): raise ValueError("Existing prediction changed")
            for name in [path.name,"static_feature_coverage.json","static_assessment.geojson"]:
                pending=tile/f"{uuid4().hex}.tmp"
                try:
                    shutil.copyfile(stage/name,pending)
                    pending.replace(tile/name)
                finally:
                    pending.unlink(missing_ok=True)
    write_json(ROOT/"coverage.json",summary(ROOT,json.loads((ROOT/"manifest.json").read_text())))
    export_reference_points()

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--project",required=True)
    repair(parser.parse_args().project)
