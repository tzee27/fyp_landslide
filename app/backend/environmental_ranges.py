"""Date-range analytics and a durable, single-worker queue for Earth Engine requests."""
import asyncio
import calendar
import json
import logging
import os
import sqlite3
from collections import defaultdict
from contextlib import closing, contextmanager
from datetime import UTC, date, datetime, timedelta
from statistics import mean

from fastapi import APIRouter, HTTPException

import environmental_analytics as env

router = APIRouter(prefix="/api/environmental-analytics")
DAY = timedelta(days=1)
INTERVAL = timedelta(hours=6)
PROJECT = os.getenv("EARTH_ENGINE_PROJECT", "fyplandslide")


@contextmanager
def queue():
    env.OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(env.OUTPUT.with_name("retrieval.sqlite"), timeout=15)) as db, db:
        db.row_factory = sqlite3.Row
        db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            factor TEXT, start TEXT, end TEXT, cursor TEXT, state TEXT, detail TEXT,
            updated TEXT, PRIMARY KEY(factor,start,end))""")
        yield db


def now():
    return datetime.now(UTC).isoformat()


def source_bounds(factor):
    if factor not in env.SOURCES:
        raise HTTPException(422,"Unknown environmental factor.")
    path = env.OUTPUT.with_name("source-availability.json")
    if not path.exists():
        raise HTTPException(503,"Checking source availability.")
    info=json.loads(path.read_text())["products"][env.SOURCES[factor][0]]
    last=datetime.fromisoformat(info["last"])
    end=last.date()
    if factor=="rainfall" and (last.hour,last.minute)<(23,30):
        end-=DAY
    return info["first"][:10], min(end,datetime.now(UTC).date()-DAY).isoformat(),info["last"]


def validate(factor,start,end):
    low,high,_=source_bounds(factor)
    if start>end or start.isoformat()<low or end.isoformat()>high:
        raise HTTPException(422,f"Choose UTC dates between {low} and {high}.")


def eligible(row):
    return row is not None and row["value"] is not None and row["coverage"]>=.95


def update(db,key,cursor,state,detail=""):
    db.execute("INSERT OR REPLACE INTO jobs VALUES (?,?,?,?,?,?,?)",(*key,cursor,state,detail,now()))


@router.post("/retrieve")
def retrieve(factor:str,start:date,end:date):
    validate(factor,start,end)
    key=(factor,start.isoformat(),end.isoformat())
    with queue() as db:
        db.execute("BEGIN IMMEDIATE")
        job=db.execute("SELECT * FROM jobs WHERE factor=? AND start=? AND end=?",key).fetchone()
        if job and (job["state"] in ("queued","running") or
                    (job["state"]=="complete" and datetime.now(UTC)-datetime.fromisoformat(job["updated"])<INTERVAL)):
            return {"state":job["state"]}
        data=env.observations()
        rows=[r for r in data["rows"] if r["factor"]==factor and len(r["date"])==10 and key[1]<=r["date"]<=key[2] and r.get("samples")==env.SOURCES[factor][3]]
        complete=len(rows)==((end-start).days+1)*len(data["regions"])
        state="complete" if complete else "queued"
        cursor=job["cursor"] if job and job["state"]=="error" else key[1]
        update(db,key,cursor,state)
    return {"state":state}


def worker_step():
    # A separate SQLite write lease prevents duplicate EE work across uvicorn workers.
    env.OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    with closing(sqlite3.connect(env.OUTPUT.with_name("retrieval-worker.sqlite"),timeout=0)) as lease:
        try:
            lease.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError:
            return
        with queue() as db:
            refresh=db.execute("SELECT * FROM jobs WHERE factor='refresh'").fetchone()
            due=not refresh or refresh["state"]=="running" or datetime.now(UTC)-datetime.fromisoformat(refresh["updated"])>(timedelta(minutes=15) if refresh["state"]=="error" else INTERVAL)
            job=db.execute("SELECT * FROM jobs WHERE state IN ('queued','running') AND factor!='refresh' ORDER BY updated LIMIT 1").fetchone()
        if due:
            key=("refresh","","")
            with queue() as db: update(db,key,"","running")
            try:
                env.refresh_latest(PROJECT,list(env.SOURCES))
                with queue() as db:
                    update(db,key,"","complete")
                    update(db,("refresh-success","",""),"","complete")
            except Exception:
                logging.exception("Environmental refresh")
                with queue() as db: update(db,key,"","error","Source check failed; retry in 15 minutes.")
            return
        if not job: return
        key=tuple(job[k] for k in ("factor","start","end"))
        cursor=date.fromisoformat(job["cursor"])
        stop=min(cursor+7*DAY,date.fromisoformat(job["end"])+DAY)
        with queue() as db: update(db,key,cursor.isoformat(),"running")
        try:
            env.backfill(PROJECT,cursor,stop,[key[0]])
            state="complete" if stop>date.fromisoformat(key[2]) else "queued"
            with queue() as db: update(db,key,stop.isoformat(),state)
        except Exception:
            logging.exception("Historical environmental retrieval")
            with queue() as db: update(db,key,cursor.isoformat(),"error","Earth Engine retrieval failed. Previously processed days are saved.")


async def schedule():
    while True:
        try:
            await asyncio.to_thread(worker_step)
        except Exception:
            logging.exception("Environmental queue")
        await asyncio.sleep(3)


@router.get("/catalog")
def catalog():
    data=env.observations()
    with queue() as db:
        row=db.execute("SELECT state,detail,updated FROM jobs WHERE factor='refresh'").fetchone()
        success=db.execute("SELECT updated FROM jobs WHERE factor='refresh-success'").fetchone()
    sources={}
    for factor,meta in data["sources"].items():
        low,high,stamp=source_bounds(factor)
        latest={}
        for r in data["rows"]:
            if r["factor"]==factor and len(r["date"])==10 and eligible(r):
                latest[r["region"]]=max(latest.get(r["region"],""),r["date"])
        sources[factor]={**meta,"first":low,"last":high,"sourceTimestamp":stamp,"latest":latest}
    return {"sources":sources,"regions":data["regions"],"refreshedAt":data["refreshedAt"],"lastRefresh":success["updated"] if success else row["updated"] if row and row["state"]=="complete" else None,"refresh":dict(row) if row else None}


def summarize(rows,expected,factor):
    valid=[r for r in rows if eligible(r)]
    values=[r["value"] for r in valid]
    return {"value":(mean(values) if factor=="moisture" else sum(values)) if len(values)==expected else None,
            "count":len(values),"expected":expected,"coverage":min((r["coverage"] for r in rows),default=None),
            "min":min(values,default=None),"max":max(values,default=None),
            "peakDate":max(valid,key=lambda row:row["value"])["date"] if valid else None}


@router.get("/range")
def range_view(factor:str,region:str,start:date,end:date):
    validate(factor,start,end)
    data=env.observations()
    if region not in data["regions"]: raise HTTPException(422,"Unknown geography.")
    days=(end-start).days+1
    history=defaultdict(dict)
    for r in data["rows"]:
        if r["factor"]==factor and len(r["date"])==10: history[r["region"]][r["date"]]=r
    def between(name,a,b):
        low,high=str(a),str(b)
        return [r for d,r in history[name].items() if low<=d<=high]
    rows=between(region,start,end)
    totals=summarize(rows,days,factor)
    resolution="Daily" if days<=45 else "Weekly" if days<=180 else "Monthly"
    if days>=730 and start.month==1 and start.day==1 and end.month==12 and end.day==31 and totals["value"] is not None:
        resolution="Yearly"
    chart=[]
    cursor=start
    while cursor<=end:
        stop=cursor
        if resolution=="Weekly": stop=cursor+6*DAY
        elif resolution=="Monthly": stop=cursor.replace(day=calendar.monthrange(cursor.year,cursor.month)[1])
        elif resolution=="Yearly": stop=cursor.replace(month=12,day=31)
        stop=min(stop,end)
        chunk=[history[region][d] for d in (str(cursor+i*DAY) for i in range((stop-cursor).days+1)) if d in history[region]]
        chart.append({"date":str(cursor),"through":str(stop),**summarize(chunk,(stop-cursor).days+1,factor)})
        cursor=stop+DAY
    comparison=[{"name":s,**summarize(between(s,start,end),days,factor)} for s in data["regions"] if s!="Whole Malaysia"]
    missing=[str(start+i*DAY) for i in range(days) if not eligible(history[region].get(str(start+i*DAY)))]
    with queue() as db:
        job=db.execute("SELECT state,detail,cursor FROM jobs WHERE factor=? AND start=? AND end=?",(factor,str(start),str(end))).fetchone()
    return {"chart":chart,"resolution":resolution,"summary":totals,"missing":missing,
            "comparison":sorted(comparison,key=lambda x:x["value"] if x["value"] is not None else -1,reverse=True),
            "previous":summarize(between(region,start-days*DAY,start-DAY),days,factor)["value"],
            "stages":sorted({s for r in rows for s in r.get("processingStatus",[])}),
            "job":dict(job) if job else None,"refreshedAt":data["refreshedAt"]}

@router.get("/reference-summary")
def reference_summary(factor:str,region:str):
    """Distributions of measured reference points, each counted once."""
    import math
    from shapely.geometry import shape, Point
    fields={"elevation":"elevation_m","slope":"slope_deg","curvature":"profile_curvature_m_inv","wetness":"topographic_wetness_index"}
    if factor not in {*fields,"soil"}: raise HTTPException(422,"Unknown reference variable.")
    boundary=None
    if region!="Whole Malaysia":
        states=json.loads(env.OUTPUT.with_name("gaul-2015-states.geojson").read_text())
        state=next((f for f in states["features"] if f["properties"]["name"]==region),None)
        if not state: raise HTTPException(422,"Unknown reference region.")
        boundary=shape(state["geometry"])
    exported=env.reference_map()
    props=[f["properties"] for f in exported["features"] if boundary is None or boundary.covers(Point(f["geometry"]["coordinates"]))]
    if factor=="soil":
        names=["clay","silt","sand"]
        triples=[[p.get("soil_"+n+"_surface") for n in names] for p in props]
        valid=[t for t in triples if all(isinstance(x,(float,int)) and math.isfinite(x) for x in t) and abs(sum(t)-100)<1]
        return {"n":len(valid),"chart":[{n:mean(x[i] for x in valid) for i,n in enumerate(names)}] if valid else [],"date":exported["referenceDate"]}
    values=[p[fields[factor]] for p in props if isinstance(p.get(fields[factor]),(int,float)) and math.isfinite(p[fields[factor]])]
    if not values: return {"n":0,"chart":[],"date":exported["referenceDate"]}
    lo,hi=min(values),max(values)
    width=(hi-lo)/10 if hi>lo else 1
    counts=[0]*(10 if hi>lo else 1)
    for v in values: counts[min(len(counts)-1,int((v-lo)/width))]+=1
    return {"n":len(values),"chart":[{"label":f"{lo+i*width:.3g}–{lo+(i+1)*width:.3g}","count":n} for i,n in enumerate(counts)],"date":exported["referenceDate"]}
