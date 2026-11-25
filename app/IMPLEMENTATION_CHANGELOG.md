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

Use Python 3.12 and Node.js 22. In the first PowerShell window, start FastAPI:

```powershell
Set-Location C:\fyp_landslide\app\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Use `python` in place of `py -3.12` when Python 3.12 is on PATH and the Python launcher is unavailable. An existing working `.venv` can be reused.

In a second window, start Vite:

```powershell
Set-Location C:\fyp_landslide\app\frontend
npm.cmd ci
$env:VITE_DATA_MODE = "api"
npm.cmd run dev -- --port 5173 --strictPort
```

From a third window, open Chrome:

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
