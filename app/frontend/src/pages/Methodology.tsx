import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { isDemo, useData } from "../app/DataProvider";
import { PageHeader, DemoNote, DataGate } from "../components/Common";
const steps = [
  "Collect historical occurrence records",
  "Validate dates, coordinates and provenance",
  "Deduplicate cross-source records",
  "Sample environmental predictors",
  "Prepare positive and control samples",
  "Train and validate candidate models",
  "Generate susceptibility estimates",
  "Update supported dynamic predictors",
  "Display recent reports separately",
  "Track quality, freshness and model versions",
];
export default function Methodology() {
  const { data } = useData();
  const [query, setQuery] = useState("");
  const records = data?.incidents ?? [];
  const quality = [
    [isDemo ? "Sample records" : "Historical candidates", records.length],
    [
      "With inventory dates",
      records.filter((i) => i.occurredAt).length,
    ],
    [
      isDemo ? "With synthetic point coordinates" : "With displayable candidate coordinates",
      records.filter((i) => i.coordinates).length,
    ],
    [
      "Area reports excluded from point training",
      records.filter((i) => i.kind === "reported-area").length,
    ],
    [
      "Flagged as verified unique events",
      records.filter((i) => i.inventory?.verifiedUniqueEvent).length,
    ],
  ];
  return (
    <div className="page">
      <PageHeader
        number="05"
        title="Data & Methodology"
        description="The provenance, process and limitations behind the perspective."
      />
      <DemoNote>
        {isDemo
          ? "Inventory counts use demonstration fixtures."
          : "Inventory counts use the curated historical candidate CSV."}
      </DemoNote>
      <DataGate>
        <section className="quality-grid">
          {quality.map(([name, count]) => (
            <div key={name}>
              <strong>{count}</strong>
              <span>{name}</span>
            </div>
          ))}
        </section>
        <section className="table-section">
          <div className="section-title">
            <div>
              <span className="eyebrow">PROVENANCE FIRST</span>
              <h2>Dataset catalogue</h2>
            </div>
            <input
              aria-label="Search datasets"
              placeholder="Find a dataset…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Role in the research</th>
                  <th>Connection</th>
                  <th>Last update</th>
                  <th>
                    <span className="sr-only">Reference link</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.sources
                  .filter((s) =>
                    (s.name + s.purpose)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="muted">{s.purpose}</td>
                      <td>
                        <span className="tag">{s.status}</span>
                      </td>
                      <td>{s.updatedAt ?? "Not available"}</td>
                      <td>
                        {s.url && <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={"Visit " + s.name}
                        >
                          <ArrowUpRight size={17} />
                        </a>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!data?.sources.some((s) =>
            (s.name + s.purpose).toLowerCase().includes(query.toLowerCase()),
          ) && <p className="empty">No datasets match this search.</p>}
        </section>
        {!isDemo && (
          <section className="table-section">
            <div className="section-title">
              <div>
                <span className="eyebrow">RESEARCH CROSS-VALIDATION</span>
                <h2>Selected Linear SVM</h2>
              </div>
            </div>
            <p>
              Full-feature balanced model. These are means across held-out geographic
              folds using a 5 km training buffer and a decision threshold of 0.0.
              Location predictions are unavailable.
            </p>
            {data?.modelEvaluation ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Branch</th><th scope="col">Folds</th>
                      <th scope="col">ROC AUC</th><th scope="col">PR AUC</th>
                      <th scope="col">Precision</th><th scope="col">Recall</th>
                      <th scope="col">F1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.modelEvaluation.map((row) => (
                      <tr key={row.branch}>
                        <th scope="row">{row.branch === "static" ? "Static" : "Temporal"}</th>
                        <td>{row.folds}</td><td>{row.rocAuc.toFixed(3)}</td>
                        <td>{row.prAuc.toFixed(3)}</td><td>{row.precision.toFixed(3)}</td>
                        <td>{row.recall.toFixed(3)}</td><td>{row.f1.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">Evaluation summary unavailable.</p>}
          </section>
        )}
        <div className="two-columns">
          <section className="pipeline">
            <span className="eyebrow">FROM INVENTORY TO INSIGHT</span>
            <h2>A traceable research pipeline.</h2>
            {steps.map((s, i) => (
              <div className="pipeline-step" key={s}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <p>{s}</p>
              </div>
            ))}
          </section>
          <section className="methodology-notes">
            <span className="eyebrow">RESEARCH NOTES</span>
            <h2>Honest about the unknowns.</h2>
            <details open>
              <summary>Occurrence is not susceptibility</summary>
              <p>
                Inventories describe recorded events. A susceptibility layer
                describes modelled potential. An external LHASA hazard nowcast
                is a separate model product and must never be counted as an
                occurrence.
              </p>
            </details>
            <details open>
              <summary>Precision determines eligibility</summary>
              <p>
                Reported districts and named localities are useful for
                monitoring, but not substitutes for verified event-level
                coordinates. Only approved precise observations should enter
                point-based training.
              </p>
            </details>
            <details>
              <summary>Historical testing context</summary>
              <p>
                The project brief reports a 261-record COOLR test ingestion and
                13 overlapping Continuuiti records. These are historical testing
                notes, not current dataset counts or newly observed events. No
                test workspace was modified.
              </p>
            </details>
            <details>
              <summary>Licensing and coverage</summary>
              <p>
                Source terms, redistribution permissions, dates, duplicates and
                spatial accuracy require review before data ingestion. GFLD,
                archived JMG records and optional Continuuiti sources can be
                added after these checks.
              </p>
            </details>
            <details>
              <summary>Geographic context</summary>
              <p>
                Country outlines use Natural Earth geometry distributed with
                world-atlas. OpenStreetMap and Esri provide selectable online
                basemaps. Country outlines are generalised and not suitable for
                cadastral decisions.
              </p>
            </details>
            <details>
              <summary>Semi-dynamic, by design</summary>
              <p>
                Rainfall and moisture may update periodically. Terrain, soils
                and faults do not change daily. Date comparisons remain
                unavailable until compatible dated layers exist.
              </p>
            </details>
          </section>
        </div>
      </DataGate>
    </div>
  );
}
