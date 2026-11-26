import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Mountain } from "lucide-react";
import { isDemo, useData } from "../app/DataProvider";
import { DemoNote, DataGate } from "../components/Common";
import WatercolorCanvas from "../components/WatercolorCanvas";
import { apiGet } from "../services/api";
const Globe = lazy(() => import("../components/Globe"));
const relatedNews = [
  {
    title: "Hujan berterusan tingkat risiko tanah runtuh, penduduk perlu peka tanda awal",
    publisher: "RTM",
    location: "Monsoon preparedness",
    date: "2026-11-20",
    dateLabel: "20 Nov 2026",
    url: "https://berita.rtm.gov.my/nasional/senarai-berita-nasional/senarai-artikel/hujan-berterusan-tingkat-risiko-tanah-runtuh-penduduk-perlu-peka-tanda-awal/",
    image: "https://berita.rtm.gov.my/wp-content/uploads/2026-NEW/02-Niaga/11NOV/2011-NSL-SPM-HUJAN-RISIKO-CERUN-RUNTUH-1-new.png",
    credit: "Article image via RTM",
  },
  {
    title: "JKR monitors 1,643 high-risk slopes ahead of the monsoon",
    location: "Slope monitoring",
    date: "2026-11-17",
    dateLabel: "17 Nov 2026",
    url: "https://bernama.com/en/news.php?id=2635614",
    image: "https://bernama.com/storage/photos/75c0967dab7a808c709472466c98dec26afbe4f180c4b-medium",
    credit: "Article image via Bernama",
  },
  {
    title: "Penang approves emergency drainage and slope stabilisation works",
    location: "Slope protection",
    date: "2026-11-12",
    dateLabel: "12 Nov 2026",
    url: "https://www.bernama.com/en/general/news.php?id=2633121",
    image: "https://www.bernama.com/storage/photos/0517a67109ded10751fa173ea3a230b06ae2eabdd19a0",
    credit: "Article image via Bernama",
  },
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
  {
    title: "Malaysia installs 34 landslide early warning systems",
    location: "Early warning",
    date: "2026-10-27",
    dateLabel: "27 Oct 2026",
    url: "https://bernama.com/tv/news.php?id=2626252",
    image: "https://bernama.com/storage/photos/5a70953ac4199da13fa3f69b6040c2376ae044a4515f0-medium",
    credit: "Article image via Bernama",
  },
];
interface NewsStory {
  title: string;
  url: string;
  date: string;
  dateLabel?: string;
  location?: string;
  publisher?: string;
  image?: string | null;
  credit?: string | null;
}

function newsImageUrl(image: string) {
  // Bernama's article metadata can point to hosts that return 404 for photos.
  // The photo host serves the same asset ID without the size suffix.
  const photo = /^https:\/\/(?:[\w-]+\.)*bernama\.com\/storage\/photos\/([a-f0-9]{40})(?:-medium)?$/i.exec(image);
  return photo ? `https://web14.bernama.com/storage/photos/${photo[1]}` : image;
}

export default function Overview() {
  const { data } = useData();
  const newsTrack = useRef<HTMLDivElement>(null);
  const [latestNews, setLatestNews] = useState<NewsStory[]>([]);
  useEffect(() => {
    if (isDemo) return;
    const controller = new AbortController();
    const load = () => {
      apiGet<{ stories: NewsStory[] }>("/api/related-news", controller.signal)
        .then(({ stories }) => setLatestNews(stories)).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      const track = newsTrack.current;
      const nextCard = track?.children[1] as HTMLElement | undefined;
      if (!track || !nextCard || document.hidden || reducedMotion.matches || track.matches(":hover, :focus-within")) return;
      const max = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: track.scrollLeft >= max - 2 ? 0 : track.scrollLeft + nextCard.offsetLeft, behavior: "smooth" });
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);
  const news: NewsStory[] = latestNews.length ? latestNews : relatedNews;
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
            <div className="overview-news-grid" ref={newsTrack} aria-label="Landslide articles">
              {news.map((story) => (
                <article key={story.url} className="overview-news-card">
                  <a href={story.url} target="_blank" rel="noreferrer">
                    <div className="overview-news-image">
                      <Mountain size={30} aria-hidden="true" />
                      {story.image && <img key={story.image} src={newsImageUrl(story.image)} alt="" loading="lazy" title={story.credit ?? undefined}
                        onError={(event) => { event.currentTarget.hidden = true; }} />}
                    </div>
                    <p className="overview-news-byline">
                      {story.publisher ?? "Bernama"} · {story.location && `${story.location} · `}
                      <time dateTime={story.date}>{story.dateLabel ?? new Intl.DateTimeFormat("en-MY", {
                        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
                      }).format(new Date(story.date))}</time>
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
