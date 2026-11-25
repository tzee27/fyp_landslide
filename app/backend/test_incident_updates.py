import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class IncidentUpdateTests(unittest.TestCase):
    def test_pending_and_reviewed_records_are_separate(self):
        client = TestClient(main.app)
        with TemporaryDirectory() as directory:
            path = Path(directory) / "reviews.sqlite3"
            with patch("incident_updates.DATABASE", path):
                before = client.get("/api/dashboard").json()
                lead = before["pendingUpdates"][0]
                self.assertFalse(path.exists())
                self.assertEqual(lead["kind"], "news-lead")
                self.assertIsNone(lead["coordinates"])
                self.assertNotIn(lead["id"], [record["id"] for record in before["incidents"]])
                url = "/api/incident-updates/" + lead["id"] + "/review"
                self.assertEqual(client.post(url, json={}).status_code, 422)
                review = {
                    "occurrence_date": "2026-11-21",
                    "longitude": 101.6,
                    "latitude": 4.6,
                    "location_evidence": "https://example.org/test-evidence",
                    "review_notes": "Synthetic test of the workflow only.",
                    "distinct_occurrence_reviewed": False,
                }
                self.assertEqual(client.post(url, json=review).status_code, 422)
                review["distinct_occurrence_reviewed"] = True
                self.assertEqual(client.post(url, json=review).status_code, 200)
                self.assertEqual(client.post(url, json=review).status_code, 409)
                after = client.get("/api/dashboard").json()
                self.assertNotIn(lead["id"], [record["id"] for record in after["pendingUpdates"]])
                self.assertEqual(after["incidents"][:-1], before["incidents"])
                added = after["incidents"][-1]
                self.assertEqual(added["kind"], "new-inventory")
                self.assertEqual(added["coordinates"], [101.6, 4.6])
                self.assertEqual(added["reviewNotes"], review["review_notes"])
