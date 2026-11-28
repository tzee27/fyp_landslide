"""Prepare daily area-weighted environmental summaries independently of inference."""

import argparse
import os
import csv
from contextlib import contextmanager, closing
import hashlib
import sqlite3
import tempfile
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException

REFERENCE_DIR = Path(__file__).resolve().parents[2] / 'data/dashboard/environmental'
OUTPUT = Path(os.environ.get('ENVIRONMENTAL_DATA_DIR', REFERENCE_DIR)) / 'observations.json'
REGIONS = 'FAO/GAUL/2015/level1'
MAP_OUTPUT = REFERENCE_DIR / 'reference-points.geojson'
REFERENCE_FIELDS = ('slope_deg', 'elevation_m', 'profile_curvature_m_inv', 'plan_curvature_m_inv',
                    'soil_clay_surface', 'soil_sand_surface', 'soil_silt_surface', 'soil_bdod_surface',
                    'topographic_wetness_index', 'merit_hand_m', 'merit_upstream_area_km2',
                    'landcover_pre_event_class', 'ndvi_pre_event', 'ndvi_change_2y', 'forest_loss_5y_250m_pct')
SOURCES = {
    'rainfall': ('NASA/GPM_L3/IMERG_V07', 'precipitation', 'mm', 48, 0.5),
    'moisture': ('ECMWF/ERA5_LAND/DAILY_AGGR', 'volumetric_soil_water_layer_1', 'm³/m³', 1, 1),
    'runoff': ('ECMWF/ERA5_LAND/DAILY_AGGR', 'surface_runoff_sum', 'mm', 1, 1000),
}
SOURCES["moisture_hourly"] = ("ECMWF/ERA5_LAND/HOURLY", "volumetric_soil_water_layer_1", SOURCES["moisture"][2], 24, 1)
SOURCES["runoff_hourly"] = ("ECMWF/ERA5_LAND/HOURLY", "surface_runoff_hourly", "mm", 24, 1000)
router = APIRouter()


@router.get('/api/environmental-observations')
def observations():
    try:
        return json.loads(OUTPUT.read_text(encoding='utf-8'))
    except FileNotFoundError as error:
        raise HTTPException(404, 'Environmental observations have not been exported.') from error


@router.get('/api/environmental-reference')
def reference_map():
    try:
        return json.loads(MAP_OUTPUT.read_text(encoding='utf-8'))
    except FileNotFoundError as error:
        raise HTTPException(404, 'Environmental reference points have not been exported.') from error


def export_reference_points():
    """Reuse observed predictor samples, independently of whether a cell was scored."""
    import math

    root = Path(__file__).resolve().parent / 'national_data/2023-01-01-10000'
    features = []
    ids = set()
    for table in sorted(root.glob('*/static_features.csv')):
        audit = json.loads(table.with_name('static_feature_coverage.json').read_text(encoding='utf-8'))
        if hashlib.sha256(table.read_bytes()).hexdigest() != audit['feature_table_sha256']:
            raise ValueError(f'Stale sample export: {table}')
        with table.open(encoding='utf-8', newline='') as handle:
            for row in csv.DictReader(handle):
                lon, lat = float(row['longitude']), float(row['latitude'])
                if row['cell_id'] in ids or not 99 <= lon <= 120 or not 0 <= lat <= 8:
                    raise ValueError(f"Invalid reference sample {row['cell_id']}")
                ids.add(row['cell_id'])
                values = {}
                for field in REFERENCE_FIELDS:
                    if row.get(field):
                        value = float(row[field])
                        if math.isfinite(value):
                            values[field] = value
                features.append({'type': 'Feature', 'id': row['cell_id'],
                                 'geometry': {'type': 'Point', 'coordinates': [lon, lat]}, 'properties': values})
    if not features:
        raise ValueError('No verified national feature tables are available.')
    payload = {'type': 'FeatureCollection', 'features': features, 'referenceDate': '2023-01-01',
               'samplingSpacingMetres': 10000}
    MAP_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = MAP_OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    temporary.replace(MAP_OUTPUT)
    return len(features)


def period_image(ee, factor, day, hourly=False):
    asset, band, unit, expected, multiplier = SOURCES[factor]
    if hourly and factor != 'rainfall':
        raise ValueError('Only rainfall supports hourly processing.')
    if factor.endswith("_hourly"):
        day = datetime.combine(day, datetime.min.time(), UTC)
        if factor == "runoff_hourly":
            day += timedelta(hours=1)  # Increments are stamped at the end of the accumulation interval.
    end = day + (timedelta(hours=1) if hourly else timedelta(days=1))
    expected = 2 if hourly else expected
    source = ee.ImageCollection(asset).filterDate(day.isoformat(), end.isoformat())
    timestamps = source.aggregate_array('system:time_start').getInfo()
    instant = datetime.fromisoformat(day.isoformat()).replace(tzinfo=UTC)
    first = int((instant-datetime(1970,1,1,tzinfo=UTC)).total_seconds()*1000)
    step = 1800000 if factor == 'rainfall' else 3600000 if factor.endswith('_hourly') else 86400000
    if sorted(timestamps) != [first + i * step for i in range(expected)]:
        return None
    images = source.select(band)
    projection = images.first().projection()
    value = (images.mean() if factor == 'moisture_hourly' else images.sum()).multiply(multiplier).rename('value')
    valid = images.count().eq(expected).And(images.min().gte(0))
    if factor.startswith('moisture'):
        valid = valid.And(images.max().lte(1))
    status = source.aggregate_array('status').distinct().getInfo() if factor == 'rainfall' else ['24-hour derived'] if factor.endswith('_hourly') else []
    return value.updateMask(valid), projection, expected, status


def extract_day(ee, regions, factor, day, hourly=False):
    product = period_image(ee, factor, day, hourly)
    if product is None:
        return []
    value, projection, expected, status = product
    valid = value.mask()
    area = ee.Image.pixelArea()
    totals = value.multiply(area).updateMask(valid).rename('weighted').addBands(
        area.updateMask(valid).rename('observed')).addBands(area.rename('total'))
    result = totals.reduceRegions(collection=regions, reducer=ee.Reducer.sum(), crs=projection,
                                  scale=projection.nominalScale(), tileScale=4)
    properties = result.map(lambda feature: ee.Feature(None, feature.toDictionary())).getInfo()['features']
    rows = []
    for feature in properties:
        row = feature['properties']
        observed, total = row.get('observed') or 0, row.get('total') or 0
        coverage = min(1, observed / total) if total else 0
        rows.append({'factor': factor, 'region': row['region'], 'date': day.isoformat()[:13] if hourly else day.isoformat(),
                     'value': row['weighted'] / observed if observed else None,
                     'coverage': coverage, 'samples': expected, 'processingStatus': status})
    return rows


def initialize_earth_engine(ee,project):
    if os.getenv("EARTH_ENGINE_USE_ADC")=="1":
        import google.auth
        credentials,_=google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform","https://www.googleapis.com/auth/earthengine"])
        ee.Initialize(credentials=credentials,project=project)
    else:
        ee.Initialize(project=project)


def prepare(project, start, end, factors, revise=False, hours=()):
    import ee

    if not 0 < (end - start).days <= 31 or end > datetime.now(UTC).date():
        raise ValueError('Use a completed UTC date range of 1–31 days, with an exclusive end.')
    if any(hour not in range(24) for hour in hours):
        raise ValueError('Use UTC hours 0–23.')
    initialize_earth_engine(ee,project)
    states = ee.FeatureCollection(REGIONS).filter(ee.Filter.eq('ADM0_NAME', 'Malaysia'))
    names = states.aggregate_array('ADM1_NAME').getInfo()
    if len(names) < 13 or len(names) != len(set(names)):
        raise ValueError('Unexpected Malaysia administrative coverage.')
    states = states.map(lambda feature: ee.Feature(feature.geometry(), {'region': feature.get('ADM1_NAME')}))
    regions = states.merge(ee.FeatureCollection([ee.Feature(states.geometry(), {'region': 'Whole Malaysia'})]))
    try:
        previous = observations()['rows']
    except HTTPException:
        previous = []
    rows = {(row['factor'], row['date'], row['region']): row for row in previous}
    expected_regions = set(names) | {'Whole Malaysia'}
    for offset in range((end - start).days):
        day = start + timedelta(days=offset)
        for factor in factors:
            if factor == 'rainfall':
                for hour in sorted(set(hours)):
                    stamp = datetime(day.year, day.month, day.day, hour, tzinfo=UTC)
                    key = stamp.isoformat()[:13]
                    if not revise and all((rows.get((factor,key,r)) or {}).get('coverage',0)>=.95 for r in expected_regions):
                        continue
                    batch = extract_day(ee, regions, factor, stamp, hourly=True)
                    if batch:
                        if {r['region'] for r in batch} != expected_regions:
                            raise ValueError('Incomplete hourly regions.')
                        rows.update({(factor,key,r['region']):r for r in batch})
                        publish(batch, expected_regions)
            existing = [rows.get((factor, day.isoformat(), region)) for region in expected_regions]
            if not revise and all(row and row.get('samples') == SOURCES[factor][3] for row in existing):
                continue
            fresh = extract_day(ee, regions, factor, day)
            if fresh and {row['region'] for row in fresh} != expected_regions:
                raise ValueError('Incomplete region export.')
            rows.update({(row['factor'], row['date'], row['region']): row for row in fresh})
            if fresh:
                publish(fresh, expected_regions)
    return list(rows.values())


def source_availability(project):
    """Collection bounds describe source timestamps, independently of dashboard coverage."""
    import ee
    initialize_earth_engine(ee,project)
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    products = {}
    for asset in sorted({item[0] for item in SOURCES.values()}):
        collection = ee.ImageCollection(asset)
        times = ee.Dictionary({
            key: collection.sort('system:time_start', ascending).first().get('system:time_start')
            for key, ascending in [('first', True), ('last', False)]
        }).getInfo()
        products[asset] = {k: (epoch + timedelta(milliseconds=v)).isoformat() for k,v in times.items()}
        if asset in (SOURCES['rainfall'][0], SOURCES['moisture_hourly'][0]):
            last = datetime.fromisoformat(products[asset]['last']).date()
            first = last - timedelta(days=6)
            stamps = collection.filterDate(first.isoformat(), (last + timedelta(days=1)).isoformat()).aggregate_array('system:time_start').getInfo()
            count = 48 if asset == SOURCES['rainfall'][0] else 24
            for shift in ([0] if count == 48 else [0, 3600000]):
                recent = {}
                for offset in range(7):
                    day = first + timedelta(days=offset)
                    start = int(datetime.combine(day, datetime.min.time(), UTC).timestamp()) * 1000 + shift
                    slots = {start + i * (86400000 // count) for i in range(count)}
                    observed = [t for t in stamps if start <= t < start + 86400000]
                    recent[day.isoformat()] = {'slots': len(slots.intersection(observed)), 'exact': sorted(observed) == sorted(slots)}
                products[asset]['intervalEndDays' if shift else 'recentDays'] = recent
    report = {'checkedAt': datetime.now(UTC).isoformat(), 'products': products}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    with observation_writer():
        temp=OUTPUT.with_name('source-availability.tmp')
        temp.write_text(json.dumps(report,indent=2),encoding='utf-8')
        temp.replace(OUTPUT.with_name('source-availability.json'))
    return report


def backfill(project, start, end, factors, hours=(), batch_days=7):
    if not 1 <= batch_days <= 31 or start >= end or end > datetime.now(UTC).date():
        raise ValueError('Choose completed UTC dates and batches of 1–31 days.')
    while start < end:
        stop = min(start + timedelta(days=batch_days), end)
        prepare(project, start, stop, factors, hours=hours)
        start = stop


def refresh_latest(project, factors, lookback_days=7):
    if not 1 <= lookback_days <= 31:
        raise ValueError('Use a lookback of 1–31 days.')
    bounds = source_availability(project)['products']
    for factor in factors:
        last = datetime.fromisoformat(bounds[SOURCES[factor][0]]['last']).date()
        end = min(datetime.now(UTC).date(),last + timedelta(days=1))
        prepare(project,end-timedelta(days=lookback_days),end,[factor],revise=True)


def calendar_summaries(rows):
    from calendar import monthrange, isleap
    groups = {}
    for row in rows:
        if len(row['date']) != 10:
            continue
        for resolution,length in [('monthly',7),('yearly',4)]:
            key=(row['factor'],row['region'],resolution,row['date'][:length])
            groups.setdefault(key,[]).append(row)
    result=[]
    for (factor,region,resolution,period),group in sorted(groups.items()):
        year=int(period[:4])
        expected=monthrange(year,int(period[5:]))[1] if resolution=='monthly' else 365+isleap(year)
        eligible=[r for r in group if r['value'] is not None and r['coverage']>=.95]
        complete=len(group)==expected and len({r['date'] for r in eligible})==expected
        method='mean' if factor.startswith('moisture') else 'sum'
        value=sum(r['value'] for r in eligible)/(expected if method=='mean' else 1) if complete else None
        result.append(dict(factor=factor,region=region,resolution=resolution,period=period,
                           eligibleDays=len(eligible),expectedDays=expected,value=value,aggregation=method))
    return result


@contextmanager
def observation_writer():
    """Serialize short read/merge/replace operations across local notebook or CLI processes."""
    key = hashlib.sha256(str(OUTPUT.resolve()).encode()).hexdigest()[:24]
    lock = Path(tempfile.gettempdir()) / f'environmental-observations-{key}.sqlite'
    with closing(sqlite3.connect(lock, timeout=30)) as connection:
        connection.execute('BEGIN IMMEDIATE')
        yield


def publish(fresh, regions):
    with observation_writer():
        previous = observations()['rows'] if OUTPUT.exists() else []
        rows = {(r['factor'],r['region'],r['date']): r for r in previous}
        rows.update({(r['factor'],r['region'],r['date']):r for r in fresh})
        write_observations(rows.values(),regions)


def write_observations(rows, regions):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    payload = {'refreshedAt': datetime.now(UTC).isoformat(), 'timezone': 'UTC', 'boundary': REGIONS,
               'regions': ['Whole Malaysia', *sorted(regions - {'Whole Malaysia'})],
               'sources': {key: {'product': values[0], 'band': values[1], 'unit': values[2]}
                           for key, values in SOURCES.items()},
               'rows': sorted(rows, key=lambda row: (row['factor'], row['region'], row['date']))}
    payload['calendarSummaries'] = calendar_summaries(payload['rows'])
    temporary.write_text(json.dumps(payload, allow_nan=False), encoding='utf-8')
    temporary.replace(OUTPUT)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--start', required=True, type=date.fromisoformat)
    parser.add_argument('--end', required=True, type=date.fromisoformat)
    parser.add_argument('--factor', nargs='+', choices=SOURCES, default=list(SOURCES))
    parser.add_argument('--hours', nargs='*', type=int, default=[])
    parser.add_argument('--revise', action='store_true')
    args = parser.parse_args()
    print(f'{len(prepare(args.project, args.start, args.end, args.factor, args.revise,args.hours))} saved region-day rows')
