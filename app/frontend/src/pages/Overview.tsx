import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Mountain } from "lucide-react";
import { isDemo, useData } from "../app/DataProvider";
import { DemoNote, DataGate } from "../components/Common";
import WatercolorCanvas from "../components/WatercolorCanvas";
const Globe = lazy(() => import("../components/Globe"));
const relatedNews = [
  {
    title: "Landslide closes a lane on Jalan Lojing–Gua Musang",
    location: "Kelantan",
    date: "2026-11-21",
    dateLabel: "21 Nov 2026",
    url: "https://web26.bernama.com/en/general/news.php?id=2637660",
    image: "https://web14.bernama.com/storage/photos/3e26e9ca14c33f8aae7d2f605e63f9e66b01ae898868f",
    credit: "File photo · JKR Gua Musang via Bernama",
  },
  {
    title: "Hillslope landslide reported in Setia Alam",
    location: "Selangor",
    date: "2026-11-19",
    dateLabel: "19 Nov 2026",
    url: "https://bernama.com/en/news.php?id=2636736",
    image: "https://web14.bernama.com/storage/photos/01f4bad80303bc18efa45f64b45f87bd6afecb61d89bb",
    credit: "Photo · JBPM via Bernama",
  },
];
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
        <DemoNote>{isDemo ? undefined : "Historical inventory candidates. Model predictions and live reports are unavailable."}</DemoNote>
        <DataGate>
          <section className="metrics">
            <div>
              <span className="eyebrow">{isDemo ? "DEMO INVENTORY" : "HISTORICAL INVENTORY"}</span>
              <strong>
                {data?.incidents.filter((i) => isDemo || i.kind === "historical").length.toString().padStart(2, "0")}
              </strong>
              <small>{isDemo ? "Curated demonstration records" : "Curated candidate records"}</small>
            </div>
            <div>
              <span className="eyebrow">{isDemo ? "REPORTED AREAS" : "VERIFIED UNIQUE EVENTS"}</span>
              <strong>
                {data?.incidents
                  .filter((i) => isDemo ? i.kind === "reported-area" : i.inventory?.verifiedUniqueEvent)
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <small>{isDemo ? "Sample reports" : "As flagged in the curated inventory"}</small>
            </div>
            <div>
              <span className="eyebrow">GEOGRAPHIC SCOPE</span>
              <strong className="metric-text">Across Malaysia</strong>
              <small>Peninsular Malaysia · Sabah · Sarawak</small>
            </div>
            <div>
              <span className="eyebrow">RESEARCH STATUS</span>
              <strong className="metric-text muted">Prediction unavailable</strong>
              <small>Environmental feeds not connected</small>
            </div>
          </section>
        </DataGate>
        <section className="overview-bottom">
          <div className="reports-preview">
            <div className="section-title">
              <div>
                <h2>Related landslide news</h2>
              </div>
              <Link className="text-link" to="/incidents">
                Incident Monitor <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="overview-news-grid">
              {relatedNews.map((story) => (
                <article key={story.url} className="overview-news-card">
                  <a href={story.url} target="_blank" rel="noreferrer">
                    <div className="overview-news-image">
                      <Mountain size={30} aria-hidden="true" />
                      <img src={story.image} alt="" loading="lazy" title={story.credit}
                        onError={(event) => { event.currentTarget.hidden = true; }} />
                    </div>
                    <p className="overview-news-byline">
                      Bernama · {story.location} · <time dateTime={story.date}>{story.dateLabel}</time>
                    </p>
                    <h3>{story.title} <ArrowUpRight size={15} aria-hidden="true" /></h3>
                  </a>
                </article>
              ))}
            </div>
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
      </div>
    </div>
  );
}
