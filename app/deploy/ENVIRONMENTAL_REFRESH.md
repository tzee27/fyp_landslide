## Unattended environmental updates

The FastAPI lifespan runs the historical retrieval queue and the six-hour source check. The checked-in systemd unit can keep that backend active on an always-on Linux host. The local Windows development server refreshes only while that computer and process run.

1. Install the application and its backend environment under /srv/landslide_fyp, including the existing backend requirements and requirements-pilot.txt. Create the landslide service account with read access to the checkout and normal access to the existing dashboard runtime directories.
2. Create /var/lib/landslide-environment owned by landslide on a persistent local disk. Seed observations.json and source-availability.json from data/dashboard/environmental on first deployment. Preserve the directory on subsequent releases. SQLite stores the retrieval cursor and worker lease alongside the cache.
3. Set EARTH_ENGINE_PROJECT in /etc/landslide/environment. Configure server-side Application Default Credentials for a service identity with access to the registered Earth Engine project. An attached workload identity is supported. For a mounted credentials file, set GOOGLE_APPLICATION_CREDENTIALS to its protected server path.
4. Install landslide-dashboard.service in /etc/systemd/system, run systemctl daemon-reload and systemctl enable --now landslide-dashboard. Route the frontend's /api requests to this backend through the same-origin reverse proxy. Use one persistent backend installation per cache.
5. Check journalctl -u landslide-dashboard and GET /api/environmental-analytics/catalog. Verify lastRefresh advances after a scheduled cycle with the laptop offline. Refresh failures retry after 15 minutes. Historical jobs retain completed batches and can resume after a restart or an explicit retry.

## Environmental product boundaries

- IMERG V07 supplies half-hourly precipitation rates on a 0.1° grid. Daily depth uses 48 correctly timed, valid rates multiplied by 0.5 hours. Processing stage is retained. NASA POWER provides both reanalysis precipitation and access to IMERG; neither is validated here as an independent, interchangeable gap filler. [NASA POWER data sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/)
- ERA5-Land Daily Aggregated supplies upper-layer volumetric soil moisture and surface runoff on an approximately 11 km grid. Daily moisture is averaged across dates in m³/m³. Runoff depths are converted from metres to millimetres and summed. The catalog endpoint reports observed collection bounds and cache dates separately for each geography. Source lag varies with publication. A complete timestamp set and 95% regional spatial coverage are required for each reported day.
- The GLC_FCS30D archive contains 1985, 1990, 1995 and annual bands for 2000–2022. Regenerate the national and state composition series using python app/backend/render_environment_maps.py --cover-only from the project root. Annual class shares are valid mapped area divided by total valid mapped area in the region, expressed as percentages on the 1 km display grid. Dynamic World provides 10 m, per-scene Sentinel-2 labels in nine broad classes. The separate post-2022 overview and its masking and sampling rules are documented below. Matching labels across these sources does not establish comparable trends. [GLC_FCS30D guide](https://zenodo.org/records/15063683/files/GLC_FCS30D%20UserGuides.pdf) · [Dynamic World catalog](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1)

## Hourly ERA5-Land validation and alternative products

Hourly-derived series have independent cache keys. Upper-layer moisture uses 00:00–23:00 UTC samples and a daily mean in m³/m³. Surface runoff uses the Earth Engine de-accumulated surface_runoff_hourly band from 01:00 through the following midnight, then converts the sum from metres to mm. Negative increments invalidate the pixel; masks can therefore differ from the daily product. A day requires each expected timestamp exactly once, 24 valid samples per pixel and at least 95% valid area in the selected region. [ERA5-Land hourly documentation](https://developers.google.com/earth-engine/datasets/catalog/ECMWF_ERA5_LAND_HOURLY)

The 28 November 2026 catalogue check found two relevant alternatives with Malaysian coverage:

| Earth Engine product | Definition and units | Grid and interval | Latest catalogue timestamp UTC | Suitability |
| --- | --- | --- | --- | --- |
| SMAP L4 v008 | Assimilated surface water content at 0–5 cm, m³/m³ | 9 km, three-hourly | 24 Nov 22:30, about four days behind | Newer surface context. Its depth differs from ERA5-Land’s 0–7 cm layer. Tropical vegetation affects microwave sensitivity; local agreement and coverage require validation. |
| GLDAS Noah v2.1 | Modelled storm surface runoff, Qs_acc in kg/m² per three-hour interval (1 kg/m² water equals 1 mm) | 0.25°, three-hourly | 16 Nov 21:00, about twelve days behind | Coarser grid and different forcing and runoff model. At this check it provides no extension. |

[SMAP L4 product](https://developers.google.com/earth-engine/datasets/catalog/NASA_SMAP_SPL4SMGP_008) · [GLDAS Noah product](https://developers.google.com/earth-engine/datasets/catalog/NASA_GLDAS_V021_NOAH_G025_T3H)

## Dynamic World overview cache

FastAPI runs a separate six-hour Dynamic World source check, with a 15-minute retry after failure. Store the dynamic-world directory alongside observations.json on persistent storage. The JSON manifest records the exact acquisitions, reporting period, class shares and mapped coverage. Each GeoTIFF uses Dynamic World codes 0–8 and nodata 255. The source/region/year views use only published manifests. Completed years are retained; the current year is checked for changed acquisitions. The export uses one acquisition per tile per month, the product cloud mask, top-class probability of at least 0.60, and a mode across three or more valid months. Equal-frequency ties resolve to the lowest class code. Areas use a 1 km Web Mercator overview grid with latitude correction. These sampled compositions may have substantial selection bias in cloudy regions. They are separate from the GLC_FCS30D classification.
