"""Read-only dashboard API for the curated research inventory."""

import csv
from pathlib import Path

from fastapi import FastAPI, HTTPException
from model_evaluation import read_model_evaluation
from incident_updates import read_updates, router as incident_updates_router

app = FastAPI(title="Malaysia Landslide Dashboard")
app.include_router(incident_updates_router)
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

    pending_updates, new_inventory = read_updates()
    return {
        "incidents": incidents + new_inventory,
        "pendingUpdates": pending_updates,
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
