import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useData } from "../app/DataProvider";
import { DemoNote, DataGate } from "../components/Common";
import { kindLabels } from "../mocks/data";
import WatercolorCanvas from "../components/WatercolorCanvas";
const Globe = lazy(() => import("../components/Globe"));
export default function Overview() {
  const { data } = useData();
  return (
    <div className="overview">
      <section className="hero">
        <WatercolorCanvas />
        <div className="hero-paper-veil" aria-hidden="true" />
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="small-line" /> AN ATLAS OF LAND, WATER &
            POSSIBILITY
          </span>
          <h1>
            The land is always
            <br />
            telling <em>a story.</em>
          </h1>
          <p>
            Follow the contours of Malaysia. Explore the rain, soil and changing
            landscapes that shape landslide susceptibility.
          </p>
          <div className="hero-actions">
            <Link to="/explorer" className="button primary">
              Explore Malaysia <ArrowUpRight size={18} />
            </Link>
            <Link to="/methodology" className="text-link">
              Behind the research <ArrowRight size={15} />
            </Link>
          </div>
          <div className="hero-footnote">
            <span className="status-dot" /> Semi-dynamic decision support{" "}
            <span className="separator">/</span> Research in progress
          </div>
        </div>
        <Suspense fallback={<div className="globe-stage skeleton" />}>
          <Globe />
        </Suspense>
      </section>
      <div className="overview-body">
        <DemoNote />
        <DataGate>
          <section className="metrics">
            <div>
              <span className="eyebrow">DEMO INVENTORY</span>
              <strong>
                {data?.incidents.length.toString().padStart(2, "0")}
              </strong>
              <small>Curated demonstration records</small>
            </div>
            <div>
              <span className="eyebrow">REPORTED AREAS</span>
              <strong>
                {data?.incidents
                  .filter((i) => i.kind === "reported-area")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <small>Sample reports · not confirmed events</small>
            </div>
            <div>
              <span className="eyebrow">GEOGRAPHIC SCOPE</span>
              <strong className="metric-text">Across Malaysia</strong>
              <small>Peninsular Malaysia · Sabah · Sarawak</small>
            </div>
            <div>
              <span className="eyebrow">RESEARCH STATUS</span>
              <strong className="metric-text muted">Awaiting training</strong>
              <small>Environmental feeds not connected</small>
            </div>
          </section>
          <section className="overview-bottom">
            <div className="reports-preview">
              <div className="section-title">
                <div>
                  <span className="eyebrow">THE INCIDENT NOTEBOOK</span>
                  <h2>From the field notebook</h2>
                </div>
                <Link className="text-link" to="/incidents">
                  View notebook <ArrowUpRight size={16} />
                </Link>
              </div>
              {data?.incidents.slice(0, 3).map((i) => (
                <Link
                  to={"/incidents?id=" + i.id}
                  className="report-row"
                  key={i.id}
                >
                  <span className={"record-symbol " + i.kind} />
                  <div>
                    <h3>{i.title}</h3>
                    <p>
                      {i.state} <span>· {kindLabels[i.kind]}</span>
                    </p>
                  </div>
                  <time>{i.reportedAt}</time>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
            <Link to="/analytics" className="terrain-feature">
              <span className="eyebrow">READING THE LANDSCAPE</span>
              <WatercolorCanvas compact />
              <div className="terrain-feature-content">
                <h2>
                  Every slope
                  <br />
                  tells a story.
                </h2>
                <p>
                  Terrain. Rainfall. Soil. Land cover.
                  <br />
                  Explore the factors behind susceptibility.
                </p>
                <span className="text-link">
                  Discover the environmental factors <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          </section>
        </DataGate>
      </div>
    </div>
  );
}
