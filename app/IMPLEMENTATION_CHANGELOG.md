# Malaysia Landslide Susceptibility implementation changelog

## 25 November 2026 — Phase 1

The CRISP-DM investigation report remains the record of the scientific work. Its earlier Streamlit interface and model-selection descriptions are historical. The application now uses React, TypeScript, Vite and MapLibre, with FastAPI serving the curated inventory locally. A future Cloudflare Worker and D1 integration will supply unverified discovery reports for review. The root `AGENTS.md` was absent in this checkout.

### Available data contracts

| Input or endpoint | Phase 1 contract |
| --- | --- |
| `data/processed/inventory/event_candidates.csv` | UTF-8 CSV with 713 historical candidate rows in source order. Counts by source are JMG original 52, JMG archive 364, COOLR 236 and GFLD 61. The stable dashboard key is `event_candidate_id`. The file flags zero rows as verified unique events. Review statuses and source-specific quality checks retain their research meanings. |
| `GET /health` | Process liveness. Returns HTTP 200 and `{"status":"ok"}`. |
| `GET /api/dashboard` | Returns `{incidents, sources}`, matching `app/frontend/src/types/index.ts`. Reads the CSV on each request. Missing or invalid input produces HTTP 503. |
| Historical record | `kind: "historical"` and `demo: false`. Labels use source locality, district and state text. `occurredAt` carries the curated ISO date when present, and `reportedAt` is null. Inventory metadata includes the original date text, precision, source record ID, curation and coordinate statuses, verified-unique flag and research model-use status. Date-range filters use available ISO dates. Impacts and article evidence are unavailable in this contract. |
| Map coordinates | Pairs are longitude then latitude. Points require the preliminary spatial-use flag, a valid numeric coordinate pair and the inside/on-boundary status. The three rows flagged for outside-boundary review stay in the notebook with null map coordinates. Mapped points retain candidate status. |
| Source catalogue | Phase 1 exposes the curated local inventory. Source update time and public reference URL are null. |
| Unverified reports and model output | The API currently supplies historical records only. Collector ingestion and model inference have no active endpoints. In explicit demo mode, sample reports and synthetic susceptibility patches carry demonstration labels. In inventory mode the synthetic patch layer is disabled. Analytics charts remain labeled synthetic in both modes. |

### Scientific artifacts

All three requested Joblib files were located and inspected as bytes for serialized identifiers, alongside their existing summaries and reload audit. No artifacts were deserialized or run.

| Artifact | Observed contents |
| --- | --- |
| `data/processed/modelling/trained_model_bundle.joblib` | 14,034 bytes. Serialized identifiers include LogisticRegression, Pipeline, ColumnTransformer and `all_environmental`. `selected_model_summary.json` describes the earlier static and temporal Logistic Regression branches. |
| `outputs/model_evaluation/static_validated_candidate.joblib` | 5,534 bytes. Reduced static Logistic Regression pipeline. The existing summary records 10 predictors and threshold 0.45, and the research reload audit records identical scores after reload. |
| `outputs/model_evaluation/temporal_validated_candidate.joblib` | 6,178 bytes. Temporal Logistic Regression pipeline without geology. The existing summary records 17 predictors and threshold 0.475, and the research reload audit records identical scores after reload. |

The official comparison in `outputs/model_evaluation/final_common_features_v1/` records the selected full-feature balanced linear-kernel SVC with 19 static and 27 temporal predictors. The saved folds use the original decision-function threshold of 0.0 and grouped geographic evaluation with the 5 km embargo. The notebook was read as source text to verify the balanced weighting and threshold. The comparison, geographic evaluation, sampling, preprocessing and thresholds were preserved. The three inspected artifacts do not provide the selected SVM for serving. Phase 1 requires no model export. The application does not retrain or replace any model.

### Files added and changed

- Added `app/backend/main.py`, `requirements.txt`, `requirements-test.txt`, `test_dashboard.py`, and a local environment/cache ignore file.
- Updated `app/frontend/src/services/api.ts`, `app/DataProvider.tsx` and `types/index.ts` under `app/frontend/src/` for the dashboard contract. The provider keeps its loading, error and retry handling.
- Updated Overview, Incidents, Explorer, Methodology and the shared TerrainMap for the historical inventory, nullable coordinates and provenance. The existing layout, watercolour artwork, navigation and map interaction components remain in use.
- Updated the frontend Vite config, package scripts, environment example and README. Added `app/frontend/tests/dashboard.integration.cjs`.
- Added this changelog. The original investigation report and protected research directories were left untouched.

### Run in Google Chrome

Use Python 3.12 and Node.js 22. Set up the backend virtual environment once:

```powershell
Set-Location C:\fyp_landslide\app\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Use `python` in place of `py -3.12` when Python 3.12 is on PATH and the Python launcher is unavailable. An existing working `.venv` can be reused.

From the frontend directory, start both FastAPI and Vite:

```powershell
Set-Location C:\fyp_landslide\app\frontend
npm.cmd ci
$env:VITE_DATA_MODE = "api"
npm.cmd run dev -- --port 5173 --strictPort
```

Keep the development terminal open while using the dashboard. The launcher reuses FastAPI if its local health endpoint is already available. From another window, open Chrome:

```powershell
Start-Process "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" -ArgumentList "http://127.0.0.1:5173/"
```

Use your Chrome executable path if Chrome was installed elsewhere. Basemap tiles and web fonts require internet access.

### Verification

| Check | Actual result |
| --- | --- |
| Backend from `app/backend` after installing `requirements-test.txt`, `\.venv\Scripts\python.exe -m unittest -v` | 4 passed. Verified FastAPI liveness, the real CSV contract, unavailable inventory handling and the absence of a prediction route. Starlette emitted a non-failing test-client dependency deprecation warning. |
| Frontend from `app/frontend`, `npm.cmd test` | 6 watercolour interaction and lifecycle tests passed. |
| Frontend from `app/frontend`, `npm.cmd run test:integration` with FastAPI running | 1 passed. Verified the real HTTP connection through Vite, inventory provenance, request cancellation and unavailable inference. |
| Frontend from `app/frontend`, `npm.cmd run build` | TypeScript and Vite build passed. Vite warned about the size of the MapLibre bundle. |
| Headless Google Chrome smoke check against the running local app | Passed. Overview showed 713 records, its link opened the correct Taman Yulek, Cheras record, and Explorer showed the synthetic layer as disabled and unchecked. The smoke check covered data presentation and navigation. |

### Outstanding work and later inputs

- **Selected model serving.** Provide the trusted fitted static or temporal full-feature balanced SVM pipeline, including its fitted preprocessing, if it exists outside this checkout. Supply a manifest with ordered feature names, units and category encoding, model version, library versions, provenance, threshold and reference score examples. If the fitted estimator was never saved, a new export would require separate permission and a decision about recovering the fitted estimator. The three existing Logistic Regression exports are separate research candidates. A later `app/backend/prediction.py` and model manifest would require approved georeferenced predictor layers or feature-extraction code, version and coverage metadata, and a null-output policy for unsupported locations. A future prediction endpoint and genuine map layer would need matching frontend contracts and validation against reference scores.
- **Cloudflare collection.** Supply the existing prototype Worker source, package manifest and lockfile if applicable, Wrangler configuration with values redacted where sensitive, D1 schema and migrations, and sanitized sample responses for the health, reports, overlap and run-history routes the frontend previously anticipated. No Worker source or Wrangler config was located in this checkout. Place the recovered files under `app/cloudflare_collector/`. A later FastAPI collector adapter will need the Worker URL, its approved authentication scheme, and an agreed review and deduplication contract before reports appear as unverified leads.
- **Manual Cloudflare settings.** Identify the intended Cloudflare account and existing Worker and D1 database, or authorize a separate provisioning step if absent. Confirm the matching D1 binding variable, database name and ID in Wrangler and apply the recovered migrations to the intended database. Confirm the UTC collection schedule and set the Cron Trigger for the Worker's scheduled handler. Store only the credentials required by the recovered prototype in Worker secrets. Any authenticated FastAPI-to-Worker credential belongs in backend runtime configuration. Exact secret names and the schedule depend on the missing prototype. [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) · [D1 setup](https://developers.cloudflare.com/d1/get-started/) · [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- **Environment and hosting.** Later live environmental layers need approved providers, dataset or project identifiers, access permissions where required, and refresh schedules. A hosted dashboard needs a frontend/API route or CORS decision and approval to distribute the curated inventory. Phase 1 uses loopback ports only.

## 25 November 2026 — Selected model evaluation in the dashboard

- Added `app/backend/model_evaluation.py` to read the existing official `LinearSVM_summary.csv`. FastAPI adds the static and temporal cross-validation metrics as `modelEvaluation` on `/api/dashboard`. If the summary is missing or invalid, this field is null and historical inventory still loads.
- Updated the dashboard contract and Data & Methodology to show mean ROC AUC, PR AUC, precision, recall and F1 across the three geographic folds for each branch. The panel identifies the 5 km buffer and original 0.0 decision threshold. It presents research evaluation and explicitly states that location predictions are unavailable.
- Six backend tests, six frontend tests and the live Vite integration test passed. The production build passed with the existing MapLibre bundle-size warning. A separate live check confirmed both evaluation rows and all 713 historical inventory records were served after restarting FastAPI.
- Repository and Git history searches still found only the three existing Logistic Regression Joblib files and no Cloudflare prototype. Prediction and collection remain pending the inputs listed above.

## 25 November 2026 — Automatic dashboard refresh and occurrence order

- The shared frontend provider reads FastAPI on open and checks again 60 seconds after each API request finishes. Manual reload is still available. A refresh failure preserves the last successful data and displays a status message.
- Report Notebook orders dated occurrences newest first. Records with only a report date follow the dated occurrences, and fully undated records appear last. The latest available occurrence date is shown above the list. The current curated inventory's latest dated candidate is Taman Sri Perkasa, Ipoh, on 15 May 2022.
- Six frontend tests and the live integration test passed. The integration test checks that even a more recent report without an occurrence date follows the dated occurrences. The production build passed with the existing MapLibre bundle-size warning.
- The supplied Cloudflare screenshots show the existing `landslide-test-db` D1 database and no deployed Worker in the selected account. Automatic dashboard refresh reads available FastAPI data. Collection of new unverified leads still requires the Worker source or an approved feed, the D1 schema or migrations, and authorized deployment with a schedule.

## 25 November 2026 — Incident update review

- Added one manually sourced lead for FT185 in Gua Musang, Kelantan, reported on 21 November. The record includes the earlier report at the same road section for duplicate review and starts with no coordinates. [November report](https://web26.bernama.com/en/general/news.php?id=2637660) · [October report](https://bernama.com/bm/wilayah/news.php?id=2623906)
- Added `pendingUpdates` to the dashboard and a separate Updates to review tab. The approval endpoint requires a reviewed occurrence date, coordinates, an evidence URL, notes and manual confirmation of a distinct event. Approval adds one **New inventory** record to the Report Notebook. Review validation checks submitted data format and depends on the reviewer for evidence and duplicate assessment.
- The application stores reviews in a local SQLite file created on first approval. The curated research CSV and model inputs remain read-only. Reviewed additions remain excluded from model training. This review endpoint is for the local dashboard and requires access controls before remote hosting. Cloudflare scheduled collection remains separate.
- Seven backend tests passed, including incomplete-review rejection, persistence, duplicate approval and inventory separation. Six frontend tests passed. The running Vite proxy served 713 historical records and one pending lead.
## 25 November 2026 — Static pilot geometry and occurrence collector

### Deployment model audit

The serialized class identifiers and saved evaluation metadata agree that `trained_model_bundle.joblib` contains the earlier all-environmental static and temporal Logistic Regression pipelines, with 14 and 20 predictors. The two validated-candidate Joblib files are also Logistic Regression. Notebook 04's official comparison evaluates the full-feature balanced linear-kernel SVC, with 19 static and 27 temporal inputs and a decision-function threshold of 0.0. The comparison saves fold results. A fitted deployment SVC with its preprocessing was not found.

Recover the original fitted pipeline if it exists. If a deployment fit is explicitly approved, use a standalone script under `app/`, the original integrated datasets and terrain sidecar join, and the frozen `spatial_partition_manifest.csv` keyed by branch and sample ID. Use only its `train` rows (1,308 static or 1,287 temporal). Exclude all held-out rows (660 static or 642 temporal) from feature selection, preprocessing, tuning and fitting. Use Notebook 04's exact branch feature order, balanced linear SVC, numeric median imputation/scaling and categorical imputation/encoding. Tune C from 0.03, 0.1 and 1.0 using the original three inner grouped geographic folds with the 5 km embargo and ROC AUC, then refit the selected pipeline on the corresponding training partition only. Preserve threshold 0.0. Export under `app/` with ordered features, data and partition hashes, package versions and reference-score parity checks. Keep existing evaluation outputs intact.

### Static pilot

`prepare_static_pilot.py` creates a geometry-only, Malaysia-clipped equal-area grid from the existing boundary. A 500 m grid over bounds 101.00 E–101.10 E and 4.55 N–4.65 N near Ipoh produced 450 valid cells. Grid IDs, sample containment and outside-Malaysia rejection were checked. The pilot footprint is geometric only. Independent extraction using the original environmental recipes and audited source vintages, inference, reference-score checks and the MapLibre score layer remain pending. No temporal run or alternative-model scoring was performed.

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe -m pip install -r requirements-pilot.txt
.\.venv\Scripts\python.exe prepare_static_pilot.py --bounds 101.00 4.55 101.10 4.65 --cell-metres 500
```

### Occurrence collection

`collect_landslides.py` uses the recovered prototype's public GDELT approach alongside Bernama English and Malay search and public listing pages for RTM, NADMA, JMG, JBPM and JKR. It records source errors and retains previously stored articles. Its six CSVs and JSON snapshot are generated under `app/backend/collector_data/`. The snapshot feeds Incident Monitor's **Updates to review**. Candidate evidence matching requires the same explicit occurrence date, state and locality. Two distinct official sources must each describe a direct observation without shared attribution to qualify for automatic two-source status. Every candidate still requires inventory review. Where parsing or source coverage is insufficient, fields stay null and evidence stays pending. PDF-only reports and dynamically rendered official tables are outside the current parser. Duplicate screening flags same-date, same-state or same-locality historical candidates for manual review.

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe collect_landslides.py --from 2026-11-18 --to 2026-11-25
# Or repeat every six hours while this terminal is running.
.\.venv\Scripts\python.exe collect_landslides.py --interval-minutes 360
```

The historical window filters retrieved articles by publication date. Search pages and GDELT have finite coverage, so this is not an exhaustive backfill. Cloudflare and the protected research files were left untouched.

Live verification retrieved two Bernama articles by URL. A separate discovery run without seed URLs found three Bernama search links and added no further candidates after filtering and deduplication. RTM, NADMA, JMG and JKR returned no usable links in the final run. JBPM failed certificate validation and GDELT timed out. The FT185 article matched the existing manual lead, and Setia Alam was added to the review queue. No candidate met the two-source rule. Eleven backend tests, six frontend tests and the frontend build passed.
## Local runtime verification

The development launcher validates `/api/dashboard` before starting Vite. A separate frontend-only session depends on a running FastAPI process. If the proxy cannot reach it, the frontend displays an actionable service-unavailable message. The Explorer reports the geometry-only pilot cell count when the grid exists and keeps the prediction layer unavailable.

Run the application from PowerShell:

```powershell
Set-Location C:\fyp_landslide\app\frontend
npm.cmd run dev -- --port 5173 --strictPort
```

Keep that shell open. In a second PowerShell window, run the collector:

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe collect_landslides.py --interval-minutes 360
```

For a separate backend terminal, run `.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000` from `app/backend` and then run `npm.cmd run dev:frontend -- --port 5173 --strictPort` from `app/frontend`. The API reads `collector_data/collection.json` on every dashboard request. The CSV exports are for review and auditing.

Verified a cold start of FastAPI and Vite, HTTP 200 through both ports, and the live Chrome views. Chrome rendered 713 historical entries, both pending leads, and the explanation for the 450 geometry-only cells. Eleven backend tests, the frontend integration test, and the production build passed.
## 26 November 2026 — Deployment SVMs, pilot measurements and source photos

- Added Notebook 05 and reusable application scripts. The earlier Joblib exports are Logistic Regression. The new deployment fits use Notebook 04's ordered 19/27 predictors, fitted preprocessing, balanced linear SVC and 0.0 decision threshold. The three grouped geographic tuning folds use the 5 km matched-group purge. Both selected C=0.1. Static fitting used 1,308 development rows and excluded 660 held-out rows. Temporal fitting used 1,287 development rows and excluded 642 held-out rows. Five development example scores per branch reproduced after reload. These checks do not replicate the official nested evaluation.
- Exported local Joblib pipelines and JSON manifests to `app/backend/model_data/`. Notebook 05 can recover these exports and checks model and input hashes, exact feature order, version and development score parity.
- Sampled real SRTM and SoilGrids values and derived curvature and TWI from local SRTM and MERIT Hydro sources. The output is `app/backend/pilot_data/static_features.csv`. Unsupported fields stay empty. All 450 cells lack at least one required input. Distance overlays, dated land cover and vegetation history, forest loss, and MERIT HAND remain to be integrated. The Explorer shows coverage and retains its unavailable susceptibility status. No static map scores, relative classes or temporal assessments were published.
- Incident Monitor shows the two Bernama source images with visible attribution and links. FT185 is explicitly labeled a file photo. The collector can preserve publisher-hosted Open Graph previews on future records. Images do not change event verification status.
- Cloud operation remains pending. The repository contains the collector prototype archive, and a verified production frontend configuration was not available. The later cloud design needs a persistent hosted Python service for inference and collection, with a scheduler and durable storage. Cloud resources were untouched.

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe -m pip install -r requirements-model.txt -r requirements-pilot.txt
.\.venv\Scripts\python.exe export_susceptibility.py static temporal
.\.venv\Scripts\python.exe sample_static_pilot.py
```

For interactive Notebook 05 use a Jupyter kernel backed by the same environment.
## Ipoh retrospective static assessment

Notebook 05 reuses the existing fitted static SVM and records model, preprocessing, coverage, inference and HTTP verification. The pilot uses the existing 450-cell grid with a 1 January 2023 assessment cutoff. Notebook 03's exact annual band rule supplied 2022 GLC_FCS30D land-cover classes for all 450 cells. The default run excludes the local OSM networks because their export date could not be established. The date stored in their DBF headers does not establish network provenance.

The Earth Engine adapter uses Notebook 02's Landsat annual NDVI for 2022 and 2020, Hansen loss over 2018–2022 with 30% baseline forest in the 250 m radius, and MERIT HAND in metres. These source calls require an authenticated project. The selected dates describe the observations used by the retrospective assessment. The archived composites and loss products may have been published later.

`sample_static_pilot.py` writes the complete predictor schema, individual missing-feature lists and a coverage audit. `score_static_pilot.py` verifies the persisted grid and feature hashes before applying the fitted SVM. Lower means a decision margin below zero, and Higher means zero or above. This convention follows the existing decision threshold. It does not define a probability. `/api/static-assessment` rejects stale grid, feature or model data. Unscored cells use a neutral outline in Explorer. The Malaysia inventory remains accessible via its own view.

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe -m pip install -r requirements-model.txt -r requirements-pilot.txt
.\.venv\Scripts\python.exe sample_static_pilot.py --assessment-date 2023-01-01
.\.venv\Scripts\python.exe score_static_pilot.py
```

For the authenticated run, add `--ee-project` with the authorized project name and `--osm-snapshot-date` with the documented date of both input network layers. The date must precede the cutoff. Use a dated set of OSM extracts if the current local files cannot be verified. The run here produced 0 completed cells and all 450 GeoJSON cell scores are null. See `app/backend/pilot_data/static_features.csv` for each cell and its missing inputs.
## Exact-source Ipoh environmental audit

Notebook 03's baseline uses Earth Engine SRTM elevation, slope and aspect at 30 m and OpenLandMap b0 soil at 250 m for both cases and controls. The local Horn-operator SRTM and SoilGrids 0–5 cm results are diagnostic columns only. The SoilGrids texture sum checks rejected 211 cells. The density range check rejected 213 cells. The 24 missing curvature pairs all have valid 5×5 DEM windows with slopes below the Notebook 02 threshold of 0.5 degrees. They remain null by design.

The Earth Engine path now samples the same SRTM and OpenLandMap sources and preserves the Notebook 02 Landsat, Hansen and MERIT HAND calculations. OpenLandMap clay and sand are percentages, silt is 100 minus clay and sand, and bulk density is divided by 100 to obtain g/cm³. The 1 January 2023 cutoff uses NDVI from 2022 and 2020 and forest loss from 2018 through 2022. The authentication probe failed before any measurements could be retrieved.

The existing OSM files have local modified timestamps in November 2026 and the DBF headers do not establish the source snapshot date. The extractor supports Geofabrik's official January 2022 archive directly and records the date, source URL and SHA-256 after a successful read. In this session, the download did not finish. A partial archive is ignored. A smaller ohsome request did not provide a usable replacement.

### Earth Engine and dated OSM on Windows

1. In Google Cloud Console, select the project used for the FYP, enable the Earth Engine API and confirm Earth Engine registration and noncommercial eligibility if applicable. Use the project ID and an account with access to that project.
2. Run the following in PowerShell. The authentication command opens a local browser sign-in.

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe -m pip install -r requirements-model.txt -r requirements-pilot.txt
.\.venv\Scripts\earthengine.exe authenticate --auth_mode localhost
$project = "YOUR_GOOGLE_CLOUD_PROJECT_ID"
.\.venv\Scripts\python.exe sample_static_pilot.py --verify-ee --ee-project $project
curl.exe --fail --location --continue-at - --output pilot_data/malaysia-singapore-brunei-220101-free.shp.zip https://download.geofabrik.de/asia/malaysia-singapore-brunei-220101-free.shp.zip
.\.venv\Scripts\python.exe sample_static_pilot.py --ee-project $project
.\.venv\Scripts\python.exe score_static_pilot.py
```

The archive is approximately 344 MB. The probe samples one real pilot point with all remote predictors and reports masked values as missing. The full run uses the archive automatically once it is complete. Refresh the Explorer after the score export. The existing endpoint serves the latest artifact when its grid, feature table and model hashes match.
## Authenticated Ipoh extraction

Project `fyplandslide` successfully returned Earth Engine inputs for the full pilot. The generated table includes MERIT HAND for 450 cells, the intended OpenLandMap soil variables for 449, previous-year NDVI for 449, NDVI change for 443, and forest loss for 378. After checking the fitted land-cover vocabulary, 362 cells have all 17 non-network inputs. The scorer maps integer GLC class codes to their exact fitted labels when the match is unambiguous, for example `190` to `190.0`. This leaves the measured class and the model artifact unchanged. Five development sample margins matched before and after the mapping check.

The historical OSM archive transfer reset before completion. Bounded historical Overpass requests also failed to return usable data. The live API therefore serves 450 cells with null margins. Once the archive download finishes, run `sample_static_pilot.py --reuse-ee` followed by `score_static_pilot.py` to add the dated distances without repeating the Earth Engine extraction.
## Scored Ipoh pilot and Malaysia static overview

For the 1 January 2023 assessment, Ipoh has 178 Lower, 184 Higher and 88 Unscored cells. The 10 km national overview finished all 69 batches and scored 2,776 of 3,827 cells. The bounded 500 m Kuching area completed all six batches and scored 213 of 285 cells. Of the scored national cells, 36 are more than 50 km from the nearest static development sample. The nationwide overview remains at 10 km and 500 m coverage is limited to the published detail areas.

Notebook 05 ran all six code cells and recorded the coverage and predictor-completeness results. Eleven backend tests, six frontend tests, the frontend integration test and the production build passed. Live Chrome checks rendered the Ipoh classes, national overview and scored Kuching detail through the Vite proxy. A national resume check skipped an already verified tile and preserved its artifact hash.

The resumed Geofabrik download reached the expected 360,854,570 bytes. Each fetched byte range was checked, the full ZIP passed CRC validation, and the archive receipt records the official 1 January 2022 source and SHA-256. The existing January 2023 Earth Engine rows were reused. The OSM reader supplied both network distances for all 450 Ipoh cells. The unchanged Linear SVM scored 362 cells, and Chrome rendered the Lower, Higher and Unscored classes from the live GeoJSON endpoint.

The 10 km national grid is clipped to the repository Malaysia administrative boundary in EPSG:6933. It uses interior sample points and includes coastal and island fragments. The grid covers Peninsular Malaysia, Sabah, Sarawak and the Federal Territories. Each tile contains at most 100 cells. Its feature CSV, validated score GeoJSON, and source provenance are saved separately. A bounded 500 m grid is supported for detail. The national coverage report distinguishes planned cells, processed cells with missing inputs, and actual scores. Its 50 km nearest-development flag is descriptive and should not be read as a model-validity criterion. Landsat, Hansen, MERIT, soil and OSM snapshots are unchanged in definition. The 10 km spacing is the overview sampling scale, not the native environmental raster resolution.

Explorer loads published viewport tiles and requests the full predictor record only when a cell is selected. The national mode becomes the default once there are real national tile scores. Ipoh is still directly accessible, and neither assessment mode removes access to the historical inventory. Chrome verified rendered national polygons as well as both Ipoh score classes and the two pending incident leads.

```powershell
Set-Location C:\fyp_landslide\app\backend
.\.venv\Scripts\python.exe download_historical_osm.py
.\.venv\Scripts\python.exe sample_static_pilot.py --reuse-ee
.\.venv\Scripts\python.exe score_static_pilot.py
.\.venv\Scripts\python.exe national_static.py plan
.\.venv\Scripts\python.exe national_static.py process --ee-project fyplandslide --workers 3
.\.venv\Scripts\python.exe national_static.py summary
```

Run the same process command again to resume. Verified outputs are skipped. Failed or stale batches are eligible for retry. Use `--tile` for specific tiles, or `--metres 500 --bounds WEST SOUTH EAST NORTH` on the plan command for detailed coverage. The pilot and national outputs are local application artifacts. Notebooks 01–04, frozen partitions, official validation results, trained model exports and the historical inventory are unchanged.
