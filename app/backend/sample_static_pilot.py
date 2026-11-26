"""Sample verified local SRTM and SoilGrids inputs for the static pilot."""

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path
from zipfile import is_zipfile

import numpy as np
import pandas as pd
import rasterio
from pyproj import Geod, Transformer
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.warp import calculate_default_transform
from rasterio.windows import Window

from export_susceptibility import ROOT, STATIC, digest
from pilot_environment import ARCHIVE_NAME, ARCHIVE_SNAPSHOT, SOIL_FIELDS, sample_earth_engine, sample_landcover, sample_network

PILOT = Path(__file__).resolve().with_name("pilot_data")
REFERENCES = ROOT / "data/raw/references"
GEOD = Geod(ellps="WGS84")
TERRAIN = STATIC[:4]
SOIL = {"clay": "Clay", "sand": "Sand", "silt": "Silt", "bdod": "Bulk_Density"}
EE_FEATURES = [*TERRAIN, *SOIL_FIELDS, "ndvi_pre_event", "ndvi_change_2y",
               "forest_loss_5y_250m_pct", "merit_hand_m"]


def coordinates(source, rows):
    if source.crs is None:
        raise ValueError(f"Missing CRS: {source.name}")
    transformer = Transformer.from_crs(4326, source.crs, always_xy=True)
    return zip(*transformer.transform(rows.longitude.to_numpy(), rows.latitude.to_numpy()), strict=True)


def terrain_sample(source, x, y, lon, lat):
    row, col = source.index(x, y)
    if not (0 < row < source.height - 1 and 0 < col < source.width - 1):
        return None
    window = source.read(1, window=Window(col - 1, row - 1, 3, 3), masked=True)
    if np.ma.getmaskarray(window).any() or not np.isfinite(window).all():
        return None
    values = np.asarray(window, dtype=float)
    dx, dy = map(abs, source.res)
    if source.crs.is_geographic:
        dx = GEOD.inv(lon, lat, lon + dx, lat)[2]
        dy = GEOD.inv(lon, lat, lon, lat + dy)[2]
    weights = np.array([1, 2, 1])
    zx = float(weights @ (values[:, 2] - values[:, 0])) / (8 * dx)
    zy = float(weights @ (values[2, :] - values[0, :])) / (8 * dy)
    aspect = np.arctan2(-zx, zy)
    return (values[1, 1], np.degrees(np.arctan(np.hypot(zx, zy))), np.sin(aspect), np.cos(aspect))


def quadratic(values, spacing):
    y, x = np.mgrid[-2:3, -2:3]
    x, y = (x * spacing).ravel(), (-y * spacing).ravel()
    design = np.column_stack([np.ones(25), x, y, x*x/2, x*y, y*y/2])
    _, p, q, r, s, t = np.linalg.lstsq(design, values.ravel(), rcond=None)[0]
    g2 = p*p + q*q
    slope = np.arctan(np.sqrt(g2))
    if slope < np.radians(0.5):
        return np.nan, np.nan, slope
    return ((r*p*p + 2*s*p*q + t*q*q) / g2 / (1+g2)**1.5,
            (r*q*q - 2*s*p*q + t*p*p) / g2 / np.sqrt(1+g2), slope)


def windows(source, rows, spacing, band, resampling):
    zones = (np.floor((rows.longitude + 180) / 6) + 1).astype(int)
    if zones.nunique() != 1 or not rows.latitude.between(0, 84).all():
        raise ValueError("A DEM window batch must lie in one northern UTM zone.")
    crs = 32600 + int(zones.iloc[0])
    transform, width, height = calculate_default_transform(
        source.crs, f"EPSG:{crs}", source.width, source.height, *source.bounds, resolution=spacing
    )
    with WarpedVRT(source, crs=f"EPSG:{crs}", transform=transform, width=width, height=height, resampling=resampling,
                   nodata=source.nodata if source.nodata is not None else -9999.0) as vrt:
        for (x, y) in coordinates(vrt, rows):
            row, col = vrt.index(x, y)
            if not (2 <= row < vrt.height - 2 and 2 <= col < vrt.width - 2):
                yield None
                continue
            values = vrt.read(band, window=Window(col-2, row-2, 5, 5), masked=True)
            yield (np.asarray(values, dtype=float) if not np.ma.getmaskarray(values).any()
                   and np.isfinite(values).all() else None)


def sample_derivatives(rows):
    rows["curvature_status"] = "NO_VALID_5X5_SRTM_WINDOW"
    zones = np.floor((rows.longitude + 180) / 6)
    for _, group in rows.groupby(zones):
        sample_derivative_zone(rows, group.index)


def sample_derivative_zone(rows, indices):
    curvature_columns = STATIC[4:6]
    for folder, spacing in (("srtm", 30), ("merit_elv", 90)):
        remaining = set(indices)
        for path in sorted((REFERENCES / "terrain" / folder).glob("*.tif")):
            if not remaining:
                break
            with rasterio.open(path) as source:
                if source.crs.to_epsg() != 4326:
                    raise ValueError(f"Unexpected DEM coordinate system: {path.name}")
                points = rows.loc[sorted(remaining)]
                points = points[points.longitude.between(source.bounds.left, source.bounds.right)
                                & points.latitude.between(source.bounds.bottom, source.bounds.top)]
                if points.empty:
                    continue
                heights = windows(source, points, spacing, 1, Resampling.bilinear)
                if folder == "srtm":
                    for index, height in zip(points.index, heights, strict=True):
                        if height is not None:
                            profile, plan, slope = quadratic(height, spacing)
                            rows.loc[index, curvature_columns] = [profile, plan]
                            rows.loc[index, "curvature_status"] = (
                                "FLAT_BELOW_0.5_DEG" if slope < np.radians(0.5) else "MEASURED"
                            )
                            remaining.discard(index)
                elif source.descriptions == ("elv", "upa"):
                    areas = windows(source, points, spacing, 2, Resampling.nearest)
                    for index, height, area in zip(points.index, heights, areas, strict=True):
                        if height is None or area is None or area[2, 2] <= 0:
                            continue
                        drainage = float(area[2, 2])
                        slope = quadratic(height, spacing)[2]
                        specific_area = max(drainage * 1e6, spacing**2) / spacing
                        rows.loc[index, "merit_upstream_area_km2"] = drainage
                        rows.loc[index, "topographic_wetness_index"] = np.log(
                            specific_area / max(np.tan(slope), np.tan(np.radians(0.5)))
                        )
                        remaining.discard(index)


def sample(reference=date(2023, 1, 1), osm_snapshot=None, ee_project=None, reuse_ee=False, *, directory=PILOT):
    if osm_snapshot is not None and osm_snapshot >= reference:
        raise ValueError("The documented OSM export date must precede the assessment cutoff.")
    grid_path = directory / "static_grid.geojson"
    table_path = directory / "static_features.csv"
    coverage_path = directory / "static_feature_coverage.json"
    grid = json.loads(grid_path.read_text(encoding="utf-8"))
    rows = pd.DataFrame([
        (feature["id"], feature["properties"]["sampleLongitude"], feature["properties"]["sampleLatitude"])
        for feature in grid["features"]
    ], columns=["cell_id", "longitude", "latitude"])
    if rows.empty or not rows.cell_id.is_unique:
        raise ValueError("A nonempty pilot grid with unique cells is required.")
    rows["assessment_date"] = reference.isoformat()
    rows[STATIC] = np.nan
    for path in sorted((REFERENCES / "terrain/srtm").glob("*.tif")):
        missing = rows.loc[rows.elevation_m.isna()]
        if missing.empty:
            break
        with rasterio.open(path) as source:
            for item, (x, y) in zip(missing.itertuples(), coordinates(source, missing), strict=True):
                values = terrain_sample(source, x, y, item.longitude, item.latitude)
                if values is not None:
                    rows.loc[item.Index, TERRAIN] = values

    depths = ("0-5", "5-15", "15-30", "30-60", "60-100", "100-200")
    for key, folder in SOIL.items():
        path = REFERENCES / f"soil/{folder}/soilgrids_{key}_malaysia.tif"
        with rasterio.open(path) as source:
            if source.count != 6 or not all(
                depth in (name or "").replace("_", "-")
                for depth, name in zip(depths, source.descriptions, strict=True)
            ):
                raise ValueError(f"Unverified SoilGrids band depth: {path.name}")
            divisor, low, high = (100, 0.1, 3.0) if key == "bdod" else (10, 0, 100)
            values = [float(pixel[0]) / divisor if not np.ma.is_masked(pixel[0]) else np.nan
                      for pixel in source.sample(coordinates(source, rows), indexes=1, masked=True)]
            series = pd.Series(values)
            rows[f"soil_{key}_surface"] = series.where(series.between(low, high))
            rows[f"soilgrids_{key}_status"] = np.select(
                [series.isna(), ~series.between(low, high)], ["MASKED_OR_NODATA", "OUT_OF_RANGE"], default="MEASURED"
            )
    texture = ["soil_clay_surface", "soil_sand_surface", "soil_silt_surface"]
    total = rows[texture].sum(axis=1, min_count=3)
    bad_texture = total.notna() & ~total.between(90, 110)
    rows.loc[bad_texture, texture] = np.nan
    rows.loc[bad_texture, ["soilgrids_clay_status", "soilgrids_sand_status", "soilgrids_silt_status"]] = "INVALID_TEXTURE_SUM"
    # The fitted model's baseline came from Notebook 03's SRTM Earth Engine
    # terrain calculation and uniform OpenLandMap b0, not these diagnostic rasters.
    for feature in TERRAIN:
        rows["diagnostic_local_" + feature] = rows[feature]
        rows[feature] = np.nan
    for feature in SOIL_FIELDS:
        rows["diagnostic_soilgrids_" + feature] = rows[feature]
        rows[feature] = np.nan
    sample_derivatives(rows)
    sample_landcover(rows, REFERENCES / "landcover/GLC_FCS30D", reference)
    archive = PILOT / ARCHIVE_NAME
    archive_receipt = archive.with_suffix(".provenance.json")
    osm_source = None
    osm_hash = None
    if osm_snapshot:
        sample_network(rows, REFERENCES / "roads", "road_distance_m")
        sample_network(rows, REFERENCES / "waterways", "waterway_distance_m")
        osm_source = "Local OSM with user-verified provenance"
    elif archive_receipt.is_file() and date.fromisoformat(ARCHIVE_SNAPSHOT) < reference:
        if not is_zipfile(archive):
            raise ValueError("The dated Geofabrik archive is unavailable or incomplete.")
        receipt = json.loads(archive_receipt.read_text(encoding="utf-8"))
        with archive.open("rb") as stream:
            osm_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        osm_source = "https://download.geofabrik.de/asia/" + ARCHIVE_NAME
        if (receipt["source"] != osm_source or receipt["snapshot_date"] != ARCHIVE_SNAPSHOT
                or receipt["bytes"] != archive.stat().st_size or receipt["sha256"] != osm_hash):
            raise ValueError("The Geofabrik archive does not match its validated download receipt.")
        sample_network(rows, REFERENCES / "roads", "road_distance_m", archive=archive)
        sample_network(rows, REFERENCES / "waterways", "waterway_distance_m", archive=archive)
        osm_snapshot = date.fromisoformat(ARCHIVE_SNAPSHOT)
    if ee_project:
        sample_earth_engine(rows, reference, ee_project)
    elif reuse_ee:
        coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
        if (not coverage.get("earth_engine_sampled") or coverage["assessment_date"] != reference.isoformat()
                or coverage["grid_sha256"] != digest(grid_path)
                or coverage["feature_table_sha256"] != digest(table_path)):
            raise ValueError("Run Earth Engine extraction for this pilot grid and assessment date before reusing results.")
        previous = pd.read_csv(table_path).set_index("cell_id")
        if len(previous) != len(rows) or not previous.index.is_unique or set(previous.index) != set(rows.cell_id):
            raise ValueError("Cached Earth Engine rows do not match the pilot grid.")
        rows[EE_FEATURES] = previous.loc[rows.cell_id, EE_FEATURES].to_numpy()
    rows["missing_features"] = rows[STATIC].isna().apply(
        lambda mask: ";".join(mask.index[mask]), axis=1,
    )
    table_tmp = table_path.with_suffix(".tmp")
    rows.to_csv(table_tmp, index=False)
    table_tmp.replace(table_path)
    coverage = {column: int(rows[column].notna().sum()) for column in STATIC}
    summary = {"cells": len(rows), "grid_sha256": digest(grid_path),
               "feature_table_sha256": digest(table_path),
               "assessment_date": reference.isoformat(),
               "osm_snapshot_date": osm_snapshot.isoformat() if osm_snapshot else None,
               "osm_source": osm_source,
               "osm_archive_sha256": osm_hash,
               "earth_engine_sampled": bool(ee_project or reuse_ee),
               "diagnostics": {name: rows[name].value_counts().to_dict()
                               for name in ["curvature_status", *(f"soilgrids_{key}_status" for key in SOIL)]},
               "complete_cells": int(rows[STATIC].notna().all(axis=1).sum()),
               "observed_cells_by_feature": coverage}
    coverage_tmp = coverage_path.with_suffix(".tmp")
    coverage_tmp.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    coverage_tmp.replace(coverage_path)
    print(json.dumps(summary, indent=2))
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assessment-date", type=date.fromisoformat, default=date(2023, 1, 1))
    parser.add_argument("--osm-snapshot-date", type=date.fromisoformat, help="Verified export date for both local OSM layers.")
    parser.add_argument("--ee-project", help="Authorized Earth Engine project. Uses existing credentials.")
    parser.add_argument("--reuse-ee", action="store_true", help="Reuse the verified Earth Engine columns for the same grid and date.")
    parser.add_argument("--verify-ee", action="store_true", help="Probe all configured Earth Engine sources at one pilot point.")
    args = parser.parse_args()
    if args.reuse_ee and args.ee_project:
        parser.error("Use either --reuse-ee or --ee-project.")
    if args.verify_ee:
        if not args.ee_project:
            parser.error("--verify-ee requires --ee-project")
        grid = json.loads((PILOT / "static_grid.geojson").read_text(encoding="utf-8"))
        first = grid["features"][0]["properties"]
        probe = pd.DataFrame({"longitude": [first["sampleLongitude"]], "latitude": [first["sampleLatitude"]]})
        probe[STATIC] = np.nan
        try:
            sample_earth_engine(probe, args.assessment_date, args.ee_project)
        except RuntimeError as error:
            parser.exit(1, f"{error}\n")
        print(probe[EE_FEATURES].to_string(index=False))
    else:
        sample(args.assessment_date, args.osm_snapshot_date, args.ee_project, args.reuse_ee)
