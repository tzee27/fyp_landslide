"""Application review records, separate from the curated research inventory."""

import json
import sqlite3
from contextlib import closing
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl

router = APIRouter()
DATABASE = Path(__file__).resolve().with_name("incident_reviews.sqlite3")
LEADS = {
    "lead-ft185-2026-11-21": {
        "title": "Landslide reported on FT185 Jalan Lojing–Gua Musang",
        "state": "Kelantan",
        "district": "Gua Musang",
        "locality": "Section 84.15 near Yayasan Albarakah",
        "reportedAt": "2026-11-21",
        "occurredAt": "2026-11-21",
        "description": (
            "Bernama reported a landslide citing JKR. Earlier reporting describes a "
            "landslide at the same road section in October. Review whether the November "
            "report represents a distinct occurrence before adding it to the notebook."
        ),
        "impacts": "Lane closure towards Cameron Highlands",
        "evidence": [
            {"publisher": "Bernama", "title": "FT185 lane closure on 21 November",
             "url": "https://web26.bernama.com/en/general/news.php?id=2637660",
             "classification": "Reported occurrence"},
            {"publisher": "Bernama", "title": "Earlier landslide at the same road section",
             "url": "https://bernama.com/bm/wilayah/news.php?id=2623906",
             "classification": "Retrospective article"},
        ],
    }
}


class Review(BaseModel):
    occurrence_date: date
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    location_evidence: HttpUrl
    review_notes: str = Field(min_length=1, max_length=2000)
    distinct_occurrence_reviewed: bool


def connect():
    connection = sqlite3.connect(DATABASE)
    connection.execute(
        "CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, payload TEXT NOT NULL)"
    )
    return connection


def read_updates():
    # Avoid creating a storage file on a read-only dashboard request.
    reviews = {}
    if DATABASE.is_file():
        with closing(connect()) as connection:
            reviews = dict(connection.execute("SELECT id, payload FROM reviews"))
    pending, reviewed = [], []
    for record_id, lead in LEADS.items():
        record = {
            **lead, "id": record_id, "demo": False, "kind": "news-lead",
            "precision": "Reported road section", "coordinates": None, "locator": None,
        }
        if record_id not in reviews:
            pending.append(record)
            continue
        review = Review.model_validate_json(reviews[record_id])
        coordinates = [review.longitude, review.latitude]
        reviewed.append({
            **record, "kind": "new-inventory", "occurredAt": review.occurrence_date.isoformat(),
            "precision": "Reviewer-supplied point", "coordinates": coordinates, "locator": coordinates,
            "reviewNotes": review.review_notes,
            "evidence": [*lead["evidence"], {
                "publisher": "Review evidence", "title": "Occurrence and location evidence",
                "url": str(review.location_evidence), "classification": "Review evidence",
            }],
        })
    return pending, reviewed


@router.post("/api/incident-updates/{record_id}/review")
def approve_review(record_id: str, review: Review):
    lead = LEADS.get(record_id)
    if lead is None:
        raise HTTPException(404, "Update report not found.")
    if (
        not review.distinct_occurrence_reviewed
        or not review.review_notes.strip()
        or review.occurrence_date > date.fromisoformat(lead["reportedAt"])
    ):
        raise HTTPException(422, "Confirm the occurrence and duplicate review, and provide a valid date and notes.")
    try:
        with closing(connect()) as connection, connection:
            connection.execute(
                "INSERT INTO reviews VALUES (?, ?)", (record_id, review.model_dump_json())
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(409, "This update is already in the New inventory.") from error
    return {"id": record_id}
