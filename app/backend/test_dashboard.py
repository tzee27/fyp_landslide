import csv
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class DashboardTests(unittest.TestCase):
    client = TestClient(main.app)

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_dashboard_preserves_curated_rows_and_coordinate_review(self):
        with main.INVENTORY.open(encoding="utf-8-sig", newline="") as source:
            rows = list(csv.DictReader(source))
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["sources"][0]["status"], "Available")
        self.assertEqual(len(result["incidents"]), len(rows))
        self.assertGreater(len(rows), 0)
        for incident, row in zip(result["incidents"], rows, strict=True):
            self.assertEqual(incident["id"], row["event_candidate_id"])
            self.assertEqual(incident["kind"], "historical")
            self.assertFalse(incident["demo"])
            self.assertIsNone(incident["reportedAt"])
            self.assertEqual(incident["occurredAt"], row["event_date"] or None)
            self.assertEqual(incident["inventory"]["sourceRecordId"], row["source_record_uid"])
            self.assertEqual(incident["inventory"]["datePrecision"], row["date_precision"])
            self.assertEqual(
                incident["inventory"]["verifiedUniqueEvent"],
                row["is_verified_unique_event"] == "True",
            )
            if row["malaysia_polygon_status"] != "inside_or_on_boundary":
                self.assertIsNone(incident["coordinates"])
                self.assertIsNone(incident["locator"])
        self.assertEqual(result["incidents"][0]["coordinates"], [101.74676999760732, 3.100021613151884])

    def test_missing_or_invalid_inventory_returns_503(self):
        with TemporaryDirectory() as directory:
            inventory = Path(directory) / "inventory.csv"
            with patch.object(main, "INVENTORY", inventory):
                self.assertEqual(self.client.get("/api/dashboard").status_code, 503)
                inventory.write_text("wrong,header\n1,2\n", encoding="utf-8")
                response = self.client.get("/api/dashboard")
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["detail"], "Curated inventory is unavailable.")

    def test_prediction_route_is_unavailable(self):
        self.assertEqual(self.client.get("/api/predictions").status_code, 404)

    def test_dashboard_exposes_official_svm_summary(self):
        result = self.client.get("/api/dashboard").json()["modelEvaluation"]
        self.assertEqual([row["branch"] for row in result], ["static", "temporal"])
        self.assertEqual([row["folds"] for row in result], [3, 3])
        self.assertAlmostEqual(result[0]["rocAuc"], 0.7900556274654488)
        self.assertAlmostEqual(result[1]["rocAuc"], 0.7822061388494954)

    def test_missing_evaluation_keeps_inventory_available(self):
        with TemporaryDirectory() as directory:
            with patch("model_evaluation.SUMMARY", Path(directory) / "missing.csv"):
                response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["modelEvaluation"])
        self.assertTrue(response.json()["incidents"])
