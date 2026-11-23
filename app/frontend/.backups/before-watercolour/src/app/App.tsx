import { lazy, Suspense, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Menu, X, Mountain, ArrowUpRight } from "lucide-react";
import { DataProvider, isDemo } from "./DataProvider";
import { ErrorBoundary } from "../components/Common";
const Overview = lazy(() => import("../pages/Overview"));
const Explorer = lazy(() => import("../pages/Explorer"));
const Analytics = lazy(() => import("../pages/Analytics"));
const Incidents = lazy(() => import("../pages/Incidents"));
const Models = lazy(() => import("../pages/Models"));
const Methodology = lazy(() => import("../pages/Methodology"));
const links = [
  ["/", "Overview"],
  ["/explorer", "Susceptibility Explorer"],
  ["/analytics", "Environmental Analytics"],
  ["/incidents", "Incident Monitor"],
  ["/models", "Model Insights"],
  ["/methodology", "Data & Methodology"],
];
function Shell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink className="brand" to="/">
          <Mountain size={30} strokeWidth={1.1} />
          <span>
            CERUN<small>MALAYSIA</small>
          </span>
        </NavLink>
        <nav className={open ? "nav open" : "nav"} aria-label="Main navigation">
          {links.map(([to, label], i) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setOpen(false)}
            >
              <span className="nav-number">0{i + 1}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="prototype">
          <span className="status-dot" />
          {isDemo ? "RESEARCH PROTOTYPE" : "API MODE"}
        </span>
        <button
          className="mobile-menu icon-button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
      <main id="main" key={location.pathname} tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<div className="skeleton">Loading view…</div>}>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/explorer" element={<Explorer />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/models" element={<Models />} />
              <Route path="/methodology" element={<Methodology />} />
              <Route
                path="*"
                element={
                  <div className="empty">
                    <h1>Page not found</h1>
                    <NavLink to="/">Return to overview</NavLink>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer>
        <span>
          CERUN{" "}
          <span className="muted">
            / Understanding terrain. Informing decisions.
          </span>
        </span>
        <NavLink to="/methodology">
          An APU final-year research project <ArrowUpRight size={13} />
        </NavLink>
      </footer>
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell />
      </DataProvider>
    </BrowserRouter>
  );
}
