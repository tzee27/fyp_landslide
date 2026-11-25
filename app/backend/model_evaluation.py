"""Read saved cross-validation metrics for the selected research model."""

import csv
from math import isfinite
from pathlib import Path

SUMMARY = (
    Path(__file__).resolve().parents[2]
    / "outputs/model_evaluation/final_common_features_v1/LinearSVM_summary.csv"
)
BRANCHES = ("static", "temporal")
METRICS = {
    "rocAuc": "roc_auc_mean",
    "prAuc": "pr_auc_mean",
    "precision": "precision_mean",
    "recall": "recall_mean",
    "f1": "f1_mean",
}


def read_model_evaluation():
    try:
        branches = {}
        with SUMMARY.open(encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source, strict=True):
                branch = row["branch"]
                if branch not in BRANCHES or branch in branches or row["algorithm"] != "LinearSVM":
                    raise ValueError("Unexpected model summary row")
                scores = {name: float(row[column]) for name, column in METRICS.items()}
                folds = int(row["folds"])
                if folds < 2 or any(not isfinite(score) or not 0 <= score <= 1 for score in scores.values()):
                    raise ValueError("Invalid cross-validation summary")
                branches[branch] = {"branch": branch, "folds": folds, **scores}
        return [branches[branch] for branch in BRANCHES]
    except (OSError, UnicodeError, csv.Error, KeyError, TypeError, ValueError):
        # Historical inventory remains usable if the evaluation summary is unavailable.
        return None
