"""Validate and publish assessment cells from the measured pilot feature table."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape

from export_susceptibility import CATEGORY, STATIC, digest, recover_export, score_complete_cells

PILOT = Path(__file__).resolve().with_name("pilot_data")


def encode_landcover(model, values):
    """Match unambiguous integer GLC codes to Notebook 04's fitted labels."""
    encoder = model.named_steps["prep"].named_transformers_["categorical"].named_steps["onehot"]
    categories = set(encoder.categories_[0]) - {"Unknown"}
    aliases = {}
    for label in categories:
        match = re.fullmatch(r"(\d+)(?:\.0+)?", label)
        if match:
            aliases.setdefault(int(match[1]), []).append(label)

    def encode(value):
        if pd.isna(value):
            return None
        value = str(value)
        if value in categories:
            return value
        match = re.fullmatch(r"(\d+)(?:\.0+)?", value)
        matches = aliases.get(int(match[1]), []) if match else []
        return matches[0] if len(matches) == 1 else None

    return values.map(encode)


def publish(directory=PILOT):
    grid_file, table_file = (directory / name for name in ("static_grid.geojson", "static_features.csv"))
    coverage = json.loads((directory / "static_feature_coverage.json").read_text(encoding="utf-8"))
    if coverage["grid_sha256"] != digest(grid_file) or coverage["feature_table_sha256"] != digest(table_file):
        raise ValueError("Grid or feature table changed after sampling.")
    grid = json.loads(grid_file.read_text(encoding="utf-8"))
    table = pd.read_csv(table_file, dtype={"landcover_pre_event_class": str}).set_index("cell_id")
    cells = grid["features"]
    if not table.index.is_unique or len(cells) != len(table) or {cell["id"] for cell in cells} != set(table.index):
        raise ValueError("Grid IDs and feature rows do not agree.")
    model, metadata = recover_export("static")
    inputs = table[STATIC].copy()
    inputs[CATEGORY] = encode_landcover(model, table[CATEGORY])
    scores = score_complete_cells(model, "static", inputs)
    for cell in cells:
        row = table.loc[cell["id"]]
        geometry = shape(cell["geometry"])
        if not geometry.is_valid or not geometry.contains(Point(row.longitude, row.latitude)):
            raise ValueError(f"Invalid geometry or sample location: {cell['id']}")
        if not np.allclose(
            [row.longitude, row.latitude],
            [cell["properties"]["sampleLongitude"], cell["properties"]["sampleLatitude"]],
            atol=1e-9, rtol=0,
        ):
            raise ValueError(f"Sampling coordinates changed: {cell['id']}")
        score = scores.loc[cell["id"]]
        missing = [name for name in STATIC if pd.isna(row[name])]
        if pd.notna(row[CATEGORY]) and pd.isna(inputs.at[cell["id"], CATEGORY]):
            missing.append("land-cover class unsupported by fitted encoding")
        category = None
        if pd.notna(score):
            category = "Higher" if score >= metadata["threshold"] else "Lower"
        elif not missing:
            missing = ["land-cover class unsupported by fitted encoding or invalid numerical input"]
        cell["properties"].update({
            "cellId": cell["id"],
            "score": float(score) if category else None,
            "category": category,
            "missing": missing,
            "environment": {name: None if pd.isna(row[name]) else row[name] for name in STATIC},
        })
    grid["assessment"] = {
        "assessmentDate": coverage["assessment_date"],
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "model": metadata["algorithm"], "modelVersion": metadata["model_sha256"][:12],
        "modelSha256": metadata["model_sha256"],
        "scoredCells": int(scores.notna().sum()), "totalCells": len(cells),
        "threshold": metadata["threshold"], "rule": "Lower: score < 0; Higher: score ≥ 0.",
        "landcoverEncoding": "Unambiguous integer GLC codes matched to the fitted Notebook 04 labels.",
        "gridSha256": coverage["grid_sha256"], "featureTableSha256": coverage["feature_table_sha256"],
        "osmSource": coverage.get("osm_source"), "osmSnapshotDate": coverage.get("osm_snapshot_date"),
        "osmArchiveSha256": coverage.get("osm_archive_sha256"),
        "earthEngineSampled": coverage.get("earth_engine_sampled", False),
    }
    target = directory / "static_assessment.geojson"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(grid, allow_nan=False), encoding="utf-8")
    temporary.replace(target)
    print(f"{grid['assessment']['scoredCells']} of {len(cells)} static pilot cells scored.")
    return grid


if __name__ == "__main__":
    publish()
