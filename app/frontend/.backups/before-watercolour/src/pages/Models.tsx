import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { PageHeader, DemoNote, Empty } from "../components/Common";
import { models, featureIllustration } from "../mocks/data";
export default function Models() {
  const [params] = useSearchParams();
  const [illustration, setIllustration] = useState(false);
  return (
    <div className="page">
      <PageHeader
        number="05"
        title="Model Insights"
        description="Transparent predictions start with transparent methods."
      />
      <DemoNote>
        No model has been trained, selected or validated. Performance metrics
        remain unavailable.
      </DemoNote>
      <section className="model-intro">
        <div>
          <span className="eyebrow">RESEARCH STAGE / MODEL DEVELOPMENT</span>
          <h2>
            Understanding the <em>why.</em>
          </h2>
          <p>
            Compare candidate approaches and examine the environmental factors
            behind future susceptibility estimates.
          </p>
        </div>
        <div className="model-status">
          <span className="status-dot" />
          <div>
            <strong>Awaiting trained model</strong>
            <p>
              Version, training inventory and validation results are not yet
              available.
            </p>
          </div>
        </div>
      </section>
      <section className="table-section">
        <div className="section-title">
          <h2>Candidate model comparison</h2>
          <span className="eyebrow">NO PERFORMANCE CLAIMS</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>ROC-AUC</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1-score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>
                    <span className="tag">{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="microcopy">
          Dashes indicate unavailable results. Validation design and decision
          thresholds are subject to the final research protocol.
        </p>
      </section>
      <div className="two-columns">
        <section className="chart-panel">
          <div className="section-title">
            <h2>Global explanations</h2>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={illustration}
              onChange={(e) => setIllustration(e.target.checked)}
            />{" "}
            Preview a synthetic importance chart
          </label>
          {illustration ? (
            <>
              <DemoNote>
                Invented UI preview values. Not SHAP outputs, learned importance
                or causal evidence.
              </DemoNote>
              <div className="importance-chart">
                {featureIllustration.map((f) => (
                  <div key={f.name}>
                    <span>{f.name}</span>
                    <div>
                      <i style={{ width: f.value * 3 + "%" }} />
                    </div>
                    <b>{f.value}%</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty title="Feature importance awaits model output">
              Connect a trained model’s explanations to reveal global feature
              contributions.
            </Empty>
          )}
        </section>
        <section className="chart-panel">
          <h2>Location-level explanation</h2>
          {params.has("lat") && (
            <p className="coordinates">
              Selected: {Number(params.get("lat")).toFixed(5)}° N,{" "}
              {Number(params.get("lng")).toFixed(5)}° E
            </p>
          )}
          <Empty title="No local explanation available">
            A selected coordinate alone does not provide a prediction.
            Environmental extraction and model output are required.
          </Empty>
          <Link to="/explorer" className="text-link">
            Choose a location in the Explorer ↗
          </Link>
        </section>
      </div>
      <section className="method-note">
        <span className="eyebrow">
          WHAT THIS MODEL WILL — AND WILL NOT — SAY
        </span>
        <p>
          Susceptibility describes the relative potential for landsliding under
          modelled conditions. It is distinct from an observed occurrence, a
          timed forecast or a measure of exposure and risk. Spatial uncertainty,
          incomplete inventories, duplicate reports, sampling bias and temporal
          coverage must be evaluated. Spatially separated validation should be
          considered to reduce information leakage.
        </p>
      </section>
    </div>
  );
}
