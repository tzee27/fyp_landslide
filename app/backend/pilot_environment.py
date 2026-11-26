"""Notebook 02/03 source adapters for the static deployment pilot."""

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from shapely import STRtree, points
from shapely import from_wkb
from shapely.ops import transform
from zipfile import ZipFile

SOIL_FIELDS = (
    "soil_clay_surface", "soil_sand_surface", "soil_silt_surface", "soil_bdod_surface",
)
SOIL_ASSETS = (
    "OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02",
    "OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02",
    "OpenLandMap/SOL/SOL_BULKDENS-FINEEARTH_USDA-4A1H_M/v02",
)
ARCHIVE_SNAPSHOT = "2022-01-01"
ARCHIVE_NAME = "malaysia-singapore-brunei-220101-free.shp.zip"


def sample_landcover(rows, root, reference):
    year = reference.year - 1
    if not 2000 <= year <= 2022:
        return
    matches = {index: set() for index in rows.index}
    for path in root.glob("GLC_FCS30D_20002022*Annual*.tif"):
        with rasterio.open(path) as source:
            if source.crs.to_epsg() != 4326 or source.count != 23:
                raise ValueError(f"Unexpected annual land-cover metadata: {path.name}")
            bounds = source.bounds
            subset = rows[rows.longitude.between(bounds.left, bounds.right, inclusive="left")
                          & rows.latitude.between(bounds.bottom, bounds.top, inclusive="right")]
            if subset.empty:
                continue
            samples = source.sample(zip(subset.longitude, subset.latitude), indexes=year - 2000 + 1, masked=True)
            for index, pixel in zip(subset.index, samples, strict=True):
                if not np.ma.is_masked(pixel[0]) and int(pixel[0]) not in {0, 220, 250}:
                    matches[index].add(str(int(pixel[0])))
    rows["landcover_pre_event_class"] = [
        next(iter(values)) if len(values) == 1 else None for values in matches.values()
    ]


def sample_network(rows, root, feature, *, archive=None):
    from pyogrio.raw import read
    from pyogrio import read_info

    bounds = (rows.longitude.min() - .25, rows.latitude.min() - .25,
              rows.longitude.max() + .25, rows.latitude.max() + .25)
    geometries = []
    paths = sorted(root.rglob("*.shp"))
    if archive is not None:
        if archive.name != ARCHIVE_NAME:
            raise ValueError("Expected the pinned Geofabrik January 2022 archive.")
        stem = "roads" if feature == "road_distance_m" else "waterways"
        with ZipFile(archive) as source:
            matches = [name for name in source.namelist()
                       if name.rsplit("/", 1)[-1] == f"gis_osm_{stem}_free_1.shp"]
        if len(matches) != 1:
            raise ValueError(f"Historical archive lacks a unique {stem} layer.")
        paths = [f"/vsizip/{archive.resolve().as_posix()}/{matches[0]}"]
    for path in paths:
        crs = read_info(path)["crs"]
        if not crs:
            raise ValueError(f"Missing network CRS: {path}")
        extent = Transformer.from_crs(4326, crs, always_xy=True).transform_bounds(*bounds)
        _, _, geometry, _ = read(path, columns=[], bbox=extent)
        project = Transformer.from_crs(crs, 3857, always_xy=True).transform
        geometries.extend(transform(project, line) for line in from_wkb(geometry)
                          if line is not None and not line.is_empty
                          and line.geom_type in {"LineString", "MultiLineString"})
    if geometries:
        project = Transformer.from_crs(4326, 3857, always_xy=True)
        xy = project.transform(rows.longitude.to_numpy(), rows.latitude.to_numpy())
        pairs, distance = STRtree(geometries).query_nearest(points(*xy), all_matches=False, return_distance=True)
        left, bottom, right, top = project.transform_bounds(*bounds)
        x, y = xy
        clip_distance = np.minimum.reduce((x-left, right-x, y-bottom, top-y))
        valid = distance < clip_distance[pairs[0]]
        rows.loc[rows.index[pairs[0][valid]], feature] = distance[valid]


def sample_earth_engine(rows, reference, project):
    import ee

    try:
        ee.Initialize(project=project)
    except ee.EEException as error:
        raise RuntimeError("Earth Engine initialization failed. Authenticate locally and verify project access.") from error
    year = reference.year
    fields = ["ndvi_pre_event", "ndvi_change_2y", "forest_loss_5y_250m_pct", "merit_hand_m"]
    if not 2006 <= year <= 2026:
        raise ValueError("Reference year is outside the approved Hansen 2025 product and NDVI windows.")
    ndvi = ee.ImageCollection("LANDSAT/COMPOSITES/C02/T1_L2_ANNUAL_NDVI")
    soil = ee.Image.cat([
        ee.Image(asset).select("b0").rename(name)
        for asset, name in zip(SOIL_ASSETS, ("clay", "sand", "density"), strict=True)
    ])
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation")
    terrain_fields = ["elevation_m", "slope_deg", "aspect_deg"]
    terrain = ee.Image.cat([dem, ee.Terrain.slope(dem), ee.Terrain.aspect(dem)]).rename(terrain_fields)

    def annual(value):
        return ndvi.filterDate(f"{value}-01-01", f"{value + 1}-01-01").select("NDVI").mosaic()

    current = annual(year - 1)
    vegetation = current.rename(fields[0]).addBands(current.subtract(annual(year - 3)).rename(fields[1]))
    hand = ee.Image("MERIT/Hydro/v1_0_1").select("hnd").rename(fields[3])
    hansen = ee.Image("UMD/hansen/global_forest_change_2025_v1_13")
    base = hansen.select("treecover2000").gte(30)
    loss = base.And(hansen.select("lossyear").gte(year - 2005)).And(hansen.select("lossyear").lte(year - 2001))
    areas = loss.multiply(ee.Image.pixelArea()).rename("lost_area").addBands(
        base.multiply(ee.Image.pixelArea()).rename("forest_area")
    )
    for start in range(0, len(rows), 50):
        batch = rows.iloc[start:start+50]
        features = ee.FeatureCollection([
            ee.Feature(ee.Geometry.Point([r.longitude, r.latitude]), {"index": int(r.Index)})
            for r in batch.itertuples()
        ])
        for image, names, scale in ((vegetation, fields[:2], 30), (hand, [fields[3]], 90)):
            data = image.unmask(-999999).sampleRegions(
                collection=features, properties=["index"], scale=scale, tileScale=4
            ).getInfo()
            for item in data["features"]:
                props = item["properties"]
                for name in names:
                    value = props.get(name)
                    if value is not None and value != -999999:
                        rows.loc[props["index"], name] = value
        for image, scale in ((soil, 250), (terrain, 30)):
            data = image.reduceRegions(collection=features, reducer=ee.Reducer.first(), scale=scale).getInfo()
            for item in data["features"]:
                props = item["properties"]
                index = props["index"]
                if scale == 250:
                    clay, sand, density = (props.get(name) for name in ("clay", "sand", "density"))
                    if clay is not None and sand is not None:
                        silt = 100 - clay - sand
                        if all(0 <= value <= 100 for value in (clay, sand, silt)):
                            rows.loc[index, list(SOIL_FIELDS[:3])] = [clay, sand, silt]
                    if density is not None and 0.1 <= density / 100 <= 3:
                        rows.loc[index, SOIL_FIELDS[3]] = density / 100
                else:
                    elevation, slope, aspect = (props.get(name) for name in terrain_fields)
                    if (elevation is not None and -10 <= elevation <= 9000
                            and slope is not None and 0 <= slope <= 90
                            and aspect is not None and 0 <= aspect <= 360):
                        angle = np.radians(aspect)
                        rows.loc[index, ["elevation_m", "slope_deg", "aspect_sin", "aspect_cos"]] = [
                            elevation, slope, np.sin(angle), np.cos(angle),
                        ]
        buffers = features.map(lambda feature: ee.Feature(feature).buffer(250))
        for item in areas.reduceRegions(collection=buffers, reducer=ee.Reducer.sum(),
                                       scale=30, tileScale=4).getInfo()["features"]:
            props = item["properties"]
            if props.get("forest_area") and props.get("lost_area") is not None:
                rows.loc[props["index"], fields[2]] = 100 * props["lost_area"] / props["forest_area"]
    bounds = dict(zip(fields, [(-1, 1), (-2, 2), (0, 100), (0, np.inf)], strict=True))
    for name, (low, high) in bounds.items():
        series = pd.to_numeric(rows[name], errors="coerce")
        rows[name] = series.where(np.isfinite(series) & series.between(low, high))
