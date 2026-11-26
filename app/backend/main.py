"""Read-only dashboard API for the curated research inventory."""

import csv
import hashlib
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from model_evaluation import read_model_evaluation
from incident_updates import read_updates, router as incident_updates_router
from national_api import router as national_api_router

app = FastAPI(title="Malaysia Landslide Dashboard")
app.include_router(incident_updates_router)
app.include_router(national_api_router)
INVENTORY = (
    Path(__file__).resolve().parents[2]
    / "data/processed/inventory/event_candidates.csv"
)
REQUIRED_COLUMNS = {
    "event_candidate_id", "source_record_uid", "source", "event_date",
    "date_precision", "original_date_value", "state_raw", "district_raw", "location_raw",
    "latitude_candidate", "longitude_candidate", "malaysia_polygon_status",
    "coordinate_usable_for_preliminary_spatial_review", "curation_status",
    "coordinate_status", "is_verified_unique_event", "model_use_status",
}
PILOT_GRID = Path(__file__).resolve().with_name("pilot_data") / "static_grid.geojson"


def pilot_cell_count():
    try:
        grid = json.loads(PILOT_GRID.read_text(encoding="utf-8"))
        if grid["type"] == "FeatureCollection" and isinstance(grid["features"], list):
            return len(grid["features"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def pilot_feature_coverage(cell_count):
    try:
        coverage = json.loads(PILOT_GRID.with_name("static_feature_coverage.json").read_text(encoding="utf-8"))
        if (isinstance(cell_count, int) and coverage["cells"] == cell_count
                and coverage["grid_sha256"] == hashlib.sha256(PILOT_GRID.read_bytes()).hexdigest()):
            complete = coverage["complete_cells"]
            if isinstance(complete, int) and 0 <= complete <= cell_count:
                return {"completeCells": complete}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def inventory_record(row):
    if any(row[column] is None for column in REQUIRED_COLUMNS):
        raise ValueError("Incomplete inventory row")
    coordinates = None
    if (
        row["coordinate_usable_for_preliminary_spatial_review"] == "True"
        and row["malaysia_polygon_status"] == "inside_or_on_boundary"
    ):
        try:
            lng = float(row["longitude_candidate"])
            lat = float(row["latitude_candidate"])
            if -180 <= lng <= 180 and -90 <= lat <= 90:
                coordinates = [lng, lat]
        except (ValueError, TypeError):
            pass

    return {
        "id": row["event_candidate_id"],
        "title": row["location_raw"] or row["district_raw"] or row["event_candidate_id"],
        "locality": row["location_raw"] or "Unknown locality",
        "state": row["state_raw"] or "Unknown state",
        "district": row["district_raw"] or "Unknown district",
        "reportedAt": None,
        "occurredAt": row["event_date"] or None,
        "kind": "historical",
        "precision": "Candidate point" if coordinates else "No displayable candidate point",
        "coordinates": coordinates,
        "locator": coordinates,
        "description": "Historical landslide inventory candidate.",
        "impacts": "Unavailable in the curated inventory",
        "evidence": [],
        "demo": False,
        "inventory": {
            "source": row["source"],
            "sourceRecordId": row["source_record_uid"],
            "datePrecision": row["date_precision"],
            "originalDateValue": row["original_date_value"] or None,
            "curationStatus": row["curation_status"],
            "coordinateStatus": row["coordinate_status"],
            "verifiedUniqueEvent": row["is_verified_unique_event"] == "True",
            "modelUseStatus": row["model_use_status"],
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/static-assessment")
def static_assessment():
    try:
        assessment = json.loads(PILOT_GRID.with_name("static_assessment.geojson").read_text(encoding="utf-8"))
        metadata = assessment["assessment"]
        for filename, field in (("static_grid.geojson", "gridSha256"), ("static_features.csv", "featureTableSha256")):
            if hashlib.sha256(PILOT_GRID.with_name(filename).read_bytes()).hexdigest() != metadata[field]:
                raise ValueError("Assessment inputs changed.")
        model = PILOT_GRID.parent.parent / "model_data/static_linear_svm.joblib"
        if hashlib.sha256(model.read_bytes()).hexdigest() != metadata["modelSha256"]:
            raise ValueError("Assessment model changed.")
        return assessment
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(404, "No current static pilot assessment is available.") from error


@app.get("/api/dashboard")
def dashboard():
    try:
        with INVENTORY.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source, strict=True)
            if not REQUIRED_COLUMNS.issubset(reader.fieldnames or []):
                raise ValueError("Missing inventory columns")
            incidents = [inventory_record(row) for row in reader]
        ids = {incident["id"] for incident in incidents}
        if not incidents or None in ids or "" in ids or len(ids) != len(incidents):
            raise ValueError("Missing or duplicate inventory IDs")
    except (OSError, UnicodeError, csv.Error, ValueError) as error:
        raise HTTPException(503, "Curated inventory is unavailable.") from error

    pending_updates, new_inventory, collection_updated_at = read_updates()
    pilot_cells = pilot_cell_count()
    return {
        "incidents": incidents + new_inventory,
        "pendingUpdates": pending_updates,
        "collectionUpdatedAt": collection_updated_at,
        "pilotGridCellCount": pilot_cells,
        "pilotFeatureCoverage": pilot_feature_coverage(pilot_cells),
        "modelEvaluation": read_model_evaluation(),
        "sources": [
            {
                "name": "Curated landslide inventory",
                "purpose": "Historical candidate records from JMG, COOLR and GFLD",
                "status": "Available",
                "updatedAt": None,
                "url": None,
            },
        ],
    }
