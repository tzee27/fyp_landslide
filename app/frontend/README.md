# CERUN — Malaysia Terrain Intelligence

A local frontend prototype for the APU final-year project: Developing a Semi-Dynamic Landslide Susceptibility Decision-Support Dashboard Using Machine Learning for Malaysia.

## Run locally

Open this folder in VS Code or Antigravity, then run:

```sh
npm install
npm run dev
```

Use the localhost URL printed by Vite. Production check: `npm run build`. Preview the production build: `npm run preview`.

## Implemented

- Five lazy-loaded React Router pages, responsive navigation and a light paper/watercolour design.
- Canvas Earth with Natural Earth geography, pointer rotation, control-scroll zoom, pause and Malaysia focus. Canvas avoids a heavyweight 3D dependency; reduced-motion disables automatic rotation.
- MapLibre map with online dark/light, satellite and topographic basemaps, Malaysia outline, six explicitly synthetic susceptibility patches, opacity controls, record visibility, clustering, location search and click inspection.
- Map notices for unavailable tiles/WebGL. Curated location search works without a geocoding API. Generalised boundaries are not cadastral data.
- Interactive synthetic rainfall, moisture and factor charts; incident search/state/type/date filters; grouped evidence and precision labels; honest labels for unavailable scientific data.
- Source catalogue, computed fixture quality counts, methodology, loading/error/empty states, reduced-motion support and keyboard focus styles.

## Data honesty and limitations

All five incident records are demo fixtures. The Seri Nilam scenario is based on the supplied brief, with unverified article URLs and event coordinates intentionally absent. The ADINet and COOLR examples are format demonstrations, not fetched source records. No fixture is eligible for real training. Area circles are approximate locality locators, not exact events or administrative boundaries. The sample rectangles are synthetic testing patches, not a Malaysian susceptibility raster.

Environmental raster layers, predictor extraction, trained model metrics, SHAP, temporal comparisons, automated collection, event verification and genuine dataset ingestion await the backend. Disabled layer controls are intentional. The date filter affects dynamic chart fixtures; static factor distributions are explicitly not date-dependent. No actual live feed is claimed.

## Integration

Copy .env.example to .env.local. VITE_DATA_MODE defaults to demo. VITE_API_BASE_URL is a public backend URL, never a secret. Only select api mode after the backend implements GET /api/dashboard returning the DashboardPayload interface in src/types/index.ts. The app validates the top-level arrays and surfaces errors; production integration should add full schema validation and authentication as needed.

src/services/api.ts separates raw collector helpers (/health, /api/reports, /api/overlaps, /api/runs) from the proposed processed dashboard contract. The raw collector is NOT assumed to supply the dashboard schema. A future prediction adapter is scaffolded but the map does not request production predictions yet. Add layer metadata/raster sources and environmental time series adapters when their contracts are settled.

Mocks and configurable category thresholds are in src/mocks/data.ts. UI types are in src/types. Each page has its own module; shared map, globe and status components live in src/components. CSS variables centralise the visual theme. Plain CSS is used instead of Tailwind to keep this prototype's dependency and configuration footprint smaller. Recharts and MapLibre are route-lazy-loaded.

## External assets

Country geography: Natural Earth via world-atlas (public domain geometry, world-atlas ISC package). Local world.json uses countries-110m.json for performance; malaysia.json uses countries-50m.json for more detailed geographic context. Basemap tiles require internet and retain provider attribution: OpenStreetMap and Esri. Verify provider usage terms and configure production services before public deployment. Google Fonts loads Instrument Serif and DM Sans; system font fallbacks work offline. No API secrets or paid map keys are embedded.

## Scope

Local-only frontend. No publishing, backend changes or modifications to inventory/Cloudflare test workspaces were performed.


## Validation

See VALIDATION.md for the browser checks and remaining integration limitations.

## Watercolour redesign

The overview uses live Canvas mountain washes, layered pigment blooms responding to mouse/touch, paper grain and a pale illustrated globe. The painting has a pause control; the globe retains rotation, drag, keyboard arrows, zoom and Malaysia focus. Animations respect reduced motion, pause offscreen or in hidden tabs, and provide a static SVG fallback when Canvas is unavailable. Compact page-header washes settle after a short introduction.

Overview, Explorer, Analytics, Incidents and Methodology remain available. Model Insights navigation and its route were removed. Its former component and pre-redesign files are archived in `.backups/before-watercolour`; ML types and the future prediction adapter remain in the source. Explorer defaults to the light basemap. Map classifications and fixture values are unchanged.

Run `npm test` for the six Canvas interaction/lifecycle checks. No additional runtime dependencies were introduced for the redesign.
