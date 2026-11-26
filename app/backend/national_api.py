"""Serve only current, published assessment tiles and on-demand cell details."""

import hashlib
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/national-static")
BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND / "national_data"
MODEL = BACKEND / "model_data/static_linear_svm.joblib"
TILE_ID = re.compile(r"\d+_\d+")


def locate(resolution):
    if resolution not in {500, 10000}:
        raise HTTPException(404, "Assessment resolution unavailable.")
    directory = ROOT / f"2023-01-01-{resolution}"
    try:
        coverage = json.loads((directory / "coverage.json").read_text(encoding="utf-8"))
        if not MODEL.is_file() or coverage["modelVersion"] != hashlib.sha256(MODEL.read_bytes()).hexdigest()[:12]:
            raise ValueError("Stale assessment")
        return directory, coverage
    except (OSError, ValueError, KeyError) as error:
        raise HTTPException(404, "National assessment coverage unavailable.") from error


def load_tile(resolution, tile):
    directory, coverage = locate(resolution)
    if not TILE_ID.fullmatch(tile) or not any(item["id"] == tile and item["processed"] for item in coverage["tiles"]):
        raise HTTPException(404, "Assessment tile not processed.")
    root = directory / tile
    try:
        data = json.loads((root / "static_assessment.geojson").read_text(encoding="utf-8"))
        meta = data["assessment"]
        if (meta["assessmentDate"] != coverage["assessmentDate"]
                or meta["modelVersion"] != coverage["modelVersion"]
                or meta["gridSha256"] != hashlib.sha256((root / "static_grid.geojson").read_bytes()).hexdigest()
                or meta["featureTableSha256"] != hashlib.sha256((root / "static_features.csv").read_bytes()).hexdigest()):
            raise ValueError("Stale assessment")
        return data
    except (OSError, ValueError, KeyError) as error:
        raise HTTPException(404, "Current assessment tile unavailable.") from error


@router.get("/{resolution}/coverage")
def get_coverage(resolution: int):
    return locate(resolution)[1]


@router.get("/{resolution}/tiles/{tile}")
def get_tile(resolution: int, tile: str):
    result = load_tile(resolution, tile)
    for feature in result["features"]:
        props = feature["properties"]
        feature["properties"] = {key: props[key] for key in ("cellId", "score", "category")}
        feature["properties"]["tileId"] = tile
    return result


@router.get("/{resolution}/tiles/{tile}/cells/{cell}")
def get_cell(resolution: int, tile: str, cell: str):
    result = load_tile(resolution, tile)
    feature = next((item for item in result["features"] if item["id"] == cell), None)
    if feature is None:
        raise HTTPException(404, "Cell absent from this assessment tile.")
    return feature
