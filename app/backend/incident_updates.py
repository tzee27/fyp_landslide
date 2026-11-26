"""Application review records, separate from the curated research inventory."""

import json
import logging
import sqlite3
from contextlib import closing
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl

router = APIRouter()
DATABASE = Path(__file__).resolve().with_name("incident_reviews.sqlite3")
COLLECTION = Path(__file__).resolve().parent / "collector_data/collection.json"
SOURCE_IMAGES = {
    "bernama:2637660": {
        "url": "https://web14.bernama.com/storage/photos/3e26e9ca14c33f8aae7d2f605e63f9e66b01ae898868f",
        "credit": "File photo · JKR Gua Musang via Bernama",
    },
    "bernama:2636736": {
        "url": "https://web14.bernama.com/storage/photos/01f4bad80303bc18efa45f64b45f87bd6afecb61d89bb",
        "credit": "Photo · JBPM via Bernama",
    },
}
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


def article_identity(url):
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if host == "bernama.com" or host.endswith(".bernama.com"):
        values = parse_qs(parsed.query).get("id", [])
        if values:
            return "bernama:" + values[0]
    return url


def collection_snapshot():
    if not COLLECTION.is_file():
        return {"events": []}
    try:
        return json.loads(COLLECTION.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logging.getLogger(__name__).warning("Collector snapshot could not be read.")
        return {"events": []}


def available_leads(snapshot):
    leads = dict(LEADS)
    known_urls = {article_identity(item["url"]): lead_id
                  for lead_id, lead in leads.items() for item in lead["evidence"]}
    for event in snapshot["events"]:
        evidence = [
            {"publisher": item["publisher"], "title": item["title"], "url": item["url"],
             "classification": "Reported occurrence", "image": item.get("image")} for item in event["evidence"]
        ]
        matching = next((known_urls[article_identity(item["url"])] for item in evidence
                         if article_identity(item["url"]) in known_urls), None)
        if matching:
            lead = leads[matching]
            leads[matching] = {**lead, "evidence": [*lead["evidence"], *(
                item for item in evidence if article_identity(item["url"]) not in known_urls
            )]}
            continue
        leads[event["id"]] = {
            "title": event["title"], "state": event["state"] or "Unknown state",
            "district": event["district"] or "Unknown district",
            "locality": event["locality"] or "Unknown locality",
            "reportedAt": event["publication_date"], "occurredAt": event["occurrence_date"],
            "description": event["description"], "impacts": "Road closure reported" if event["road_closure"] else "Unavailable",
            "verificationStatus": event["verification_status"],
            "evidence": evidence,
        }
    return leads


def read_updates():
    # Avoid creating a storage file on a read-only dashboard request.
    reviews = {}
    if DATABASE.is_file():
        with closing(connect()) as connection:
            reviews = dict(connection.execute("SELECT id, payload FROM reviews"))
    pending, reviewed = [], []
    snapshot = collection_snapshot()
    for record_id, lead in available_leads(snapshot).items():
        record = {
            **lead, "id": record_id, "demo": False, "kind": "news-lead",
            "precision": "Reported road section", "coordinates": None, "locator": None,
        }
        for evidence in lead["evidence"]:
            image = SOURCE_IMAGES.get(article_identity(evidence["url"])) or evidence.get("image")
            if image:
                record["sourceImage"] = {**image, "articleUrl": evidence["url"]}
                break
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
    return pending, reviewed, snapshot.get("updated_at")


@router.post("/api/incident-updates/{record_id}/review")
def approve_review(record_id: str, review: Review):
    lead = available_leads(collection_snapshot()).get(record_id)
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
