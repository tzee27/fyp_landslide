"""Generate a geometry-only static assessment grid. No model inference is performed."""

import argparse
import json
import math
from pathlib import Path

from pyproj import Transformer
from shapely import transform
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[2]
BOUNDARY = ROOT / "data/raw/references/boundary/mys_admin0.geojson"
OUTPUT = ROOT / "app/backend/pilot_data"


def make_grid(bounds, cell_metres):
    west, south, east, north = bounds
    if not (-180 <= west < east <= 180 and -90 < south < north < 90):
        raise ValueError("Provide ordered WGS84 bounds as west south east north.")
    if not 100 <= cell_metres <= 5000:
        raise ValueError("Pilot cell size must be between 100 and 5000 metres.")
    to_grid = Transformer.from_crs(4326, 6933, always_xy=True).transform
    to_map = Transformer.from_crs(6933, 4326, always_xy=True).transform
    aoi = box(*bounds)
    projected = transform(aoi, to_grid, interleaved=False)
    min_x, min_y, max_x, max_y = projected.bounds
    x_range = range(math.floor(min_x / cell_metres), math.ceil(max_x / cell_metres))
    y_range = range(math.floor(min_y / cell_metres), math.ceil(max_y / cell_metres))
    if len(x_range) * len(y_range) > 10_000:
        raise ValueError("Choose a smaller pilot area or a coarser grid.")
    boundary = json.loads(BOUNDARY.read_text(encoding="utf-8-sig"))
    malaysia = unary_union([make_valid(shape(feature["geometry"])) for feature in boundary["features"]])
    coverage = transform(malaysia.intersection(aoi), to_grid, interleaved=False)
    cells = []
    for x in x_range:
        for y in y_range:
            cell = box(x * cell_metres, y * cell_metres, (x + 1) * cell_metres, (y + 1) * cell_metres)
            if not coverage.covers(cell):
                continue
            sample = transform(cell.centroid, to_map, interleaved=False)
            cells.append({
                "type": "Feature", "id": f"static-{cell_metres}-{x}-{y}",
                "geometry": mapping(transform(cell, to_map, interleaved=False)),
                "properties": {"sampleLongitude": sample.x, "sampleLatitude": sample.y},
            })
    if not cells:
        raise ValueError("The pilot contains no complete grid cells within Malaysia.")
    return {"type": "FeatureCollection", "features": cells}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bounds", nargs=4, type=float, required=True)
    parser.add_argument("--cell-metres", type=int, default=500)
    args = parser.parse_args()
    try:
        grid = make_grid(args.bounds, args.cell_metres)
    except ValueError as error:
        parser.error(str(error))
    OUTPUT.mkdir(exist_ok=True)
    target = OUTPUT / "static_grid.geojson"
    target.write_text(json.dumps(grid, separators=(",", ":")), encoding="utf-8")
    print(f"Prepared {len(grid['features'])} geometry-only cells at {args.cell_metres} m in {target}")
