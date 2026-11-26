"""Prepare and process date-stamped Malaysia assessment tiles independently."""

import argparse
import json
import math
import re
import time
from uuid import uuid4
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date
from functools import lru_cache
from pathlib import Path
from zipfile import is_zipfile

import numpy as np
from pyproj import Transformer
from sklearn.neighbors import BallTree
from shapely import make_valid, transform, union_all
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.prepared import prep

from export_susceptibility import OUTPUT, STATIC, development_rows, digest
from prepare_static_pilot import BOUNDARY
from pilot_environment import ARCHIVE_NAME
from sample_static_pilot import PILOT, sample
from score_static_pilot import publish

NATIONAL = Path(__file__).resolve().with_name("national_data")
GRID_CRS = 6933
TILE_ID = re.compile(r"\d+_\d+")
MODELS = OUTPUT / "static_linear_svm.joblib"


def write_json(path, payload):
    temporary = path.with_suffix(f".{uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        for attempt in range(6):
            try:
                temporary.replace(path)
                return
            except PermissionError:
                if attempt == 5:
                    raise
                time.sleep(0.1 * (attempt + 1))
    finally:
        temporary.unlink(missing_ok=True)


def boundary():
    document = json.loads(BOUNDARY.read_text(encoding="utf-8-sig"))
    return unary_union([make_valid(shape(item["geometry"])) for item in document["features"]])


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry] if geometry.area > 0 else []
    if hasattr(geometry, "geoms"):
        return [part for child in geometry.geoms for part in polygons(child)]
    return []


def plan(directory, metres, reference, bounds=None):
    if metres not in {500, 10000} or (metres == 500 and bounds is None):
        raise ValueError("Use 10 km for nationwide coverage, or 500 m with explicit detail bounds.")
    country = boundary()
    if bounds:
        west, south, east, north = bounds
        if not (west < east and south < north and east - west <= 1 and north - south <= 1):
            raise ValueError("Use ordered detail bounds of at most one degree per axis.")
        country = country.intersection(box(*bounds))
    forward = Transformer.from_crs(4326, GRID_CRS, always_xy=True).transform
    inverse = Transformer.from_crs(GRID_CRS, 4326, always_xy=True).transform
    country = transform(country, forward, interleaved=False)
    if country.is_empty:
        raise ValueError("No land intersects the selected bounds.")
    prepared = prep(country)
    left, bottom, right, top = country.bounds
    groups = defaultdict(list)
    cells_per_tile = 10
    for x in range(math.floor(left / metres), math.ceil(right / metres)):
        for y in range(math.floor(bottom / metres), math.ceil(top / metres)):
            rectangle = box(x * metres, y * metres, (x + 1) * metres, (y + 1) * metres)
            if not prepared.intersects(rectangle):
                continue
            pieces = polygons(country.intersection(rectangle))
            if not pieces:
                continue
            cell = union_all(pieces)
            if cell.is_empty or not cell.is_valid or not prepared.covers(cell.representative_point()):
                raise ValueError(f"Invalid assessment geometry {x}/{y}.")
            point = transform(cell.representative_point(), inverse, interleaved=False)
            geometry = transform(cell, inverse, interleaved=False)
            tile = f"{x // cells_per_tile}_{y // cells_per_tile}"
            groups[tile].append({
                "type": "Feature", "id": f"static-{metres}-{x}-{y}", "geometry": mapping(geometry),
                "properties": {"sampleLongitude": point.x, "sampleLatitude": point.y,
                               "assessmentDate": reference.isoformat(), "landAreaKm2": cell.area / 1e6},
            })
    directory.mkdir(parents=True, exist_ok=True)
    tiles = []
    for tile, features in sorted(groups.items()):
        target = directory / tile
        target.mkdir(exist_ok=True)
        grid = target / "static_grid.geojson"
        payload = {"type": "FeatureCollection", "features": features}
        encoded = json.dumps(payload, separators=(",", ":"))
        if not grid.exists() or grid.read_text(encoding="utf-8") != encoded:
            write_json(grid, payload)
        extent = [shape(feature["geometry"]).bounds for feature in features]
        tiles.append({"id": tile, "cells": len(features), "bounds": [
            min(a[0] for a in extent), min(a[1] for a in extent),
            max(a[2] for a in extent), max(a[3] for a in extent),
        ]})
    manifest = {"assessmentDate": reference.isoformat(), "cellMetres": metres, "gridCrs": GRID_CRS,
                "boundarySha256": digest(BOUNDARY), "bounds": bounds, "tiles": tiles}
    write_json(directory / "manifest.json", manifest)
    return manifest


def ready(directory, tile, reference, model_hash):
    if not TILE_ID.fullmatch(tile):
        return None
    directory = directory / tile
    try:
        result = json.loads((directory / "static_assessment.geojson").read_text(encoding="utf-8"))
        meta = result["assessment"]
        if (meta["assessmentDate"] == reference and meta["modelSha256"] == model_hash
                and meta["gridSha256"] == digest(directory / "static_grid.geojson")
                and meta["featureTableSha256"] == digest(directory / "static_features.csv")):
            return result
    except (OSError, ValueError, KeyError):
        pass
    return None


@lru_cache(maxsize=1)
def development_locations():
    rows = development_rows("static")
    return BallTree(np.radians(rows[["latitude", "longitude"]].to_numpy()), metric="haversine")


@lru_cache(maxsize=512)
def development_distance(grid, grid_hash):
    cells = json.loads(grid.read_text(encoding="utf-8"))["features"]
    points = np.radians([
        (cell["properties"]["sampleLatitude"], cell["properties"]["sampleLongitude"])
        for cell in cells
    ])
    distance = development_locations().query(points, k=1)[0].ravel() * 6371.0088
    far = {cell["id"] for cell, km in zip(cells, distance, strict=True) if km > 50}
    return {
        "cellsOver50KmFromDevelopment": len(far),
        "maxNearestDevelopmentKm": round(float(distance.max()), 2),
    }, far


def summary(directory, manifest):
    model_hash = digest(MODELS)
    batches = []
    measurements = Counter({feature: 0 for feature in STATIC})
    for tile in manifest["tiles"]:
        result = ready(directory, tile["id"], manifest["assessmentDate"], model_hash)
        scored = result["assessment"]["scoredCells"] if result else 0
        grid = directory / tile["id"] / "static_grid.geojson"
        distance_summary, far = development_distance(grid, digest(grid))
        scored_far = 0
        if result:
            for cell in result["features"]:
                if cell["id"] in far and cell["properties"]["score"] is not None:
                    scored_far += 1
                measurements.update(
                    name for name, value in cell["properties"]["environment"].items() if value is not None
                )
        batches.append({**tile, "processed": result is not None, "scored": scored,
                        **distance_summary, "scoredCellsOver50KmFromDevelopment": scored_far})
    planned = sum(batch["cells"] for batch in batches)
    processed = sum(batch["cells"] for batch in batches if batch["processed"])
    return {**manifest, "tiles": batches, "plannedCells": planned, "processedCells": processed,
            "unprocessedCells": planned - processed, "scoredCells": sum(batch["scored"] for batch in batches),
            "unscoredProcessedCells": processed - sum(batch["scored"] for batch in batches),
            "observedCellsByFeature": dict(measurements),
            "modelVersion": model_hash[:12],
            "cellsOver50KmFromDevelopment": sum(batch["cellsOver50KmFromDevelopment"] for batch in batches),
            "scoredCellsOver50KmFromDevelopment": sum(batch["scoredCellsOver50KmFromDevelopment"] for batch in batches),
            "coverageCaveat": "Distance to the nearest static development sample is a descriptive support check. The 50 km flag is not a prediction validity threshold."}


def process_tile(target, reference, project, reuse):
    try:
        sample(reference, ee_project=None if reuse else project, reuse_ee=reuse, directory=target)
        result = publish(directory=target)
        return target.name, result["assessment"]["scoredCells"], None
    except Exception as error:
        # Keep other geographic batches and their checkpoints available on source failure.
        return target.name, 0, str(error)


def process(directory, manifest, project, identifiers=None, limit=None, workers=1):
    reference = date.fromisoformat(manifest["assessmentDate"])
    model_hash = digest(MODELS)
    archive = (PILOT / ARCHIVE_NAME).with_suffix(".provenance.json").is_file() and is_zipfile(PILOT / ARCHIVE_NAME)
    done = skipped = 0
    failures = []
    jobs = []
    tiles = [tile["id"] for tile in manifest["tiles"]]
    if identifiers and not set(identifiers).issubset(tiles):
        raise ValueError("Requested tile is absent from the assessment manifest.")
    for tile in identifiers or tiles:
        if limit is not None and len(jobs) >= limit:
            break
        output = ready(directory, tile, reference.isoformat(), model_hash)
        meta = output["assessment"] if output else {}
        if output and (not project or meta["earthEngineSampled"]) and (not archive or meta["osmSource"]):
            skipped += 1
            continue
        target = directory / tile
        # A published checkpoint has verified table/grid hashes. Reuse its EE measurements when adding OSM.
        reuse = bool(meta.get("earthEngineSampled"))
        jobs.append((target, reference, project, reuse))

    def checkpoint(outcome):
        nonlocal done
        tile, scored, error = outcome
        if error is not None:
            failures.append({"tile": tile, "error": error})
            print(f"{tile}: {error}", flush=True)
        else:
            done += 1
            try:
                write_json(directory / "coverage.json", summary(directory, manifest))
            except PermissionError:
                print("Coverage file temporarily locked; the completed tile remains saved.", flush=True)
            print(f"{tile}: {scored} scored; {done}/{len(jobs)} new batches processed.", flush=True)

    if workers == 1:
        for job in jobs:
            checkpoint(process_tile(*job))
    elif jobs:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            for future in as_completed([executor.submit(process_tile, *job) for job in jobs]):
                checkpoint(future.result())
    print(json.dumps({"processed": done, "skipped": skipped, "failed": failures}))
    return not failures


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["plan", "process", "summary"])
    parser.add_argument("--metres", type=int, choices=[500, 10000], default=10000)
    parser.add_argument("--assessment-date", type=date.fromisoformat, default=date(2023, 1, 1))
    parser.add_argument("--bounds", type=float, nargs=4)
    parser.add_argument("--ee-project")
    parser.add_argument("--tile", action="append")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--workers", type=int, choices=[1, 2, 3], default=1)
    args = parser.parse_args()
    target = NATIONAL / f"{args.assessment_date.isoformat()}-{args.metres}"
    if args.operation == "plan":
        manifest = plan(target, args.metres, args.assessment_date, args.bounds)
    else:
        manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
    if args.operation == "process" and not process(target, manifest, args.ee_project, args.tile, args.limit, args.workers):
        raise SystemExit(1)
    report = summary(target, manifest)
    write_json(target / "coverage.json", report)
    print(json.dumps({key: value for key, value in report.items() if key != "tiles"}))
