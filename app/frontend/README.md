# CERUN — Malaysia Terrain Intelligence

A local dashboard for the APU final-year project on semi-dynamic landslide susceptibility in Malaysia.

## Run locally

Set up the backend virtual environment once using the [Windows setup commands](../IMPLEMENTATION_CHANGELOG.md#run-in-google-chrome). Then run these commands from this folder:

```sh
npm.cmd ci
npm.cmd run dev
```

`npm.cmd run dev` starts FastAPI if needed and waits for a valid dashboard response on port 8000 before starting Vite. Keep that PowerShell window open while using the dashboard. Run `npm.cmd run dev:frontend` only when FastAPI is already running separately. The occurrence collector runs in its own PowerShell window. A production preview uses `npm.cmd run build` followed by `npm.cmd run preview` with FastAPI already running.

## Implemented

- Five lazy-loaded React Router pages, responsive navigation and a light paper/watercolour design.
- Canvas Earth with Natural Earth geography, pointer rotation, control-scroll zoom, pause and Malaysia focus. Canvas avoids a heavyweight 3D dependency; reduced-motion disables automatic rotation.
- MapLibre map with online dark/light, satellite and topographic basemaps, Malaysia outline, record visibility, clustering, location search and click inspection. Explicit demo mode enables synthetic patches and opacity controls.
- Map notices for unavailable tiles/WebGL. Curated location search works without a geocoding API. Generalised boundaries are not cadastral data.
- Interactive synthetic rainfall, moisture and factor charts; incident search/state/type/date filters; grouped evidence and precision labels; honest labels for unavailable scientific data.
- Source catalogue, computed inventory quality counts, methodology, loading/error/empty states, reduced-motion support and keyboard focus styles.

## Data honesty and limitations

Overview and Incidents show curated historical candidate records. Explorer maps candidate points that passed the preliminary display checks. Demo mode has five synthetic incident fixtures and uses approximate locality circles for area fixtures.

Environmental raster layers, predictor extraction, model inference, temporal comparisons, automated collection and event verification are future work. Analytics uses labeled synthetic chart fixtures.

## Integration

API mode is the default. The Vite proxy forwards `/api/dashboard` and `/health` to FastAPI. For synthetic fixtures, set `VITE_DATA_MODE=demo` in `.env.local`. An optional `VITE_API_BASE_URL` is public configuration. A different origin requires a reverse proxy or explicit CORS configuration.

Mocks and configurable category thresholds are in src/mocks/data.ts. UI types are in src/types. Each page has its own module; shared map, globe and status components live in src/components. CSS variables centralise the visual theme. Plain CSS is used instead of Tailwind to keep this prototype's dependency and configuration footprint smaller. Recharts and MapLibre are route-lazy-loaded.

## External assets

Country geography: Natural Earth via world-atlas (public domain geometry, world-atlas ISC package). Local world.json uses countries-110m.json for performance; malaysia.json uses countries-50m.json for more detailed geographic context. Basemap tiles require internet and retain provider attribution: OpenStreetMap and Esri. Verify provider usage terms and configure production services before public deployment. Google Fonts loads Instrument Serif and DM Sans; system font fallbacks work offline. No API secrets or paid map keys are embedded.

## Scope

Local React and FastAPI application. The Cloudflare collector is a later integration.


## Validation

See VALIDATION.md for the browser checks and remaining integration limitations.

## Watercolour redesign

The overview uses live Canvas mountain washes, layered pigment blooms responding to mouse/touch, paper grain and a pale illustrated globe. The painting has a pause control; the globe retains rotation, drag, keyboard arrows, zoom and Malaysia focus. Animations respect reduced motion, pause offscreen or in hidden tabs, and provide a static SVG fallback when Canvas is unavailable. Compact page-header washes settle after a short introduction.

Overview, Explorer, Analytics, Incidents and Methodology remain available. Model Insights navigation and its route were removed. Its former component and pre-redesign files are archived in `.backups/before-watercolour`; ML types and the future prediction adapter remain in the source. Explorer defaults to the light basemap. Map classifications and fixture values are unchanged.

Run `npm.cmd test` for the six Canvas interaction checks. Run `npm.cmd run test:integration` with FastAPI listening on port 8000 to test the live frontend service and proxy.
