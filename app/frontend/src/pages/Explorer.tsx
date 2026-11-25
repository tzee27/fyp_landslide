import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Layers,
  Search,
  SlidersHorizontal,
  X,
  ArrowUpRight,
} from "lucide-react";
import TerrainMap, { type Selection } from "../components/TerrainMap";
import { PageHeader, DemoNote, DataGate } from "../components/Common";
import { places, layers, categoryScale, kindLabels } from "../mocks/data";
import { isDemo, useData } from "../app/DataProvider";
export default function Explorer() {
  const { data } = useData();
  const [basemap, setBasemap] = useState("Light"),
    [opacity, setOpacity] = useState(0.65),
    [zones, setZones] = useState(isDemo),
    [records, setRecords] = useState(true),
    [panel, setPanel] = useState(true),
    [place, setPlace] = useState(places[0]),
    [selection, setSelection] = useState<Selection | null>(null),
    [search, setSearch] = useState("");
  const groups = [...new Set(layers.map((l) => l.group))];
  return (
    <div className="page explorer-page">
      <PageHeader
        number="02"
        title="Susceptibility Explorer"
        description="A spatial perspective on Malaysia’s terrain. Explore, inspect and question."
      />
      <DemoNote>
        {isDemo
          ? "Coloured rectangles show synthetic demonstration patches. Hollow circles indicate approximate area locators."
          : "Points show historical inventory candidates. Model-generated susceptibility is unavailable."}
      </DemoNote>
      <DataGate>
        <div className="map-toolbar">
          <div className="location-search">
            <Search size={16} />
            <input
              aria-label="Search Malaysian locations"
              placeholder="Find a state, district or locality…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <div className="search-results">
                {places
                  .filter((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setPlace(p);
                        setSelection({ coordinates: p.center });
                        setSearch("");
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                {!places.some((p) =>
                  p.name.toLowerCase().includes(search.toLowerCase()),
                ) && <p>No matches in the curated location index.</p>}
              </div>
            )}
          </div>
          <label className="inline-label">
            Basemap{" "}
            <select
              value={basemap}
              onChange={(e) => setBasemap(e.target.value)}
            >
              {["Light", "Terrain", "Satellite", "Dark"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <button onClick={() => setPlace({ ...places[0] })}>Reset view</button>
          <button
            className={panel ? "active" : ""}
            aria-expanded={panel}
            onClick={() => setPanel(!panel)}
          >
            <Layers size={16} /> Layers
          </button>
        </div>
        <div className="explorer-workspace">
          <TerrainMap
            incidents={data?.incidents ?? []}
            basemap={basemap}
            opacity={opacity}
            showZones={zones}
            showRecords={records}
            place={place}
            onSelect={setSelection}
          />
          {panel && (
            <aside className="layer-panel">
              <div className="panel-title">
                <h3>
                  <SlidersHorizontal size={14} /> Map layers
                </h3>
                <button
                  className="icon-button"
                  aria-label="Close layer panel"
                  onClick={() => setPanel(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={zones}
                  disabled={!isDemo}
                  onChange={(e) => setZones(e.target.checked)}
                />
                Synthetic patches
              </label>
              <label className="range-label">
                Opacity <span>{Math.round(opacity * 100)}%</span>
                <input
                  aria-label="Susceptibility opacity"
                  disabled={!isDemo}
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={opacity}
                  onChange={(e) => setOpacity(+e.target.value)}
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={records}
                  onChange={(e) => setRecords(e.target.checked)}
                />
                {isDemo ? "Demonstration records" : "Historical candidate points"}
              </label>
              {groups
                .filter((g) => g !== "Model output")
                .map((group) => (
                  <details key={group}>
                    <summary>
                      {group}
                      <span>Not configured</span>
                    </summary>
                    {layers
                      .filter((l) => l.group === group)
                      .map((l) => (
                        <label className="unavailable-layer" key={l.id}>
                          <input type="checkbox" disabled />
                          {l.name}
                        </label>
                      ))}
                  </details>
                ))}
              <p className="microcopy">
                Connect a geospatial dataset to enable its layer. LHASA is an
                external hazard nowcast.
              </p>
            </aside>
          )}
          {selection && (
            <aside className="inspection-panel">
              <div className="panel-title">
                <span className="eyebrow">LOCATION INSPECTION</span>
                <button
                  className="icon-button"
                  aria-label="Close location details"
                  onClick={() => setSelection(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <h2>{selection.incident?.title ?? "Selected location"}</h2>
              <p className="coordinates">
                {selection.coordinates[1].toFixed(5)}° N,{" "}
                {selection.coordinates[0].toFixed(5)}° E
              </p>
              {selection.incident ? (
                <>
                  <span className="tag">
                    {kindLabels[selection.incident.kind]}
                  </span>
                  <p>{selection.incident.precision}</p>
                  <Link
                    className="text-link"
                    to={"/incidents?id=" + selection.incident.id}
                  >
                    Read record and evidence <ArrowUpRight size={14} />
                  </Link>
                </>
              ) : (
                <>
                  <div className="inspection-result">
                    <span>{isDemo ? "Synthetic susceptibility" : "Model susceptibility"}</span>
                    <strong>{selection.category ?? "Not available"}</strong>
                    <small>
                      {selection.category
                        ? "Synthetic patch value; not a scientific result"
                        : "No connected predictor extraction at this location."}
                    </small>
                  </div>
                  <dl className="details-list">
                    {[
                      "Elevation",
                      "Slope",
                      "Soil composition",
                      "Lithology",
                      "Road / fault / waterway distance",
                      "Land cover & year",
                      "Antecedent rainfall",
                      "Soil moisture",
                      "Prediction timestamp",
                    ].map((x) => (
                      <div key={x}>
                        <dt>{x}</dt>
                        <dd>Not available</dd>
                      </div>
                    ))}
                  </dl>
                  <Link className="text-link" to="/methodology">
                    Understanding susceptibility <ArrowUpRight size={14} />
                  </Link>
                </>
              )}
            </aside>
          )}
          <div className="map-legend">
            <span className="eyebrow">
              {zones ? "SYNTHETIC SUSCEPTIBILITY" : isDemo ? "SYNTHETIC PATCHES HIDDEN" : "SUSCEPTIBILITY UNAVAILABLE"}
            </span>
            {zones && (
              <div className="legend-scale">
                {categoryScale.map((c) => (
                  <div key={c.name}>
                    <span style={{ background: c.color }} />
                    {c.name}
                  </div>
                ))}
              </div>
            )}
            <div className="record-legend">
              <span>● {isDemo ? "Sample point" : "Candidate point"}</span>
              {isDemo && <span>◯ Approximate area</span>}
              <span>◉ Record cluster</span>
            </div>
          </div>
        </div>
        <div className="map-bottom">
          <span>
            Country outlines: Natural Earth · basemap attribution on map
          </span>
          <span>
            {isDemo ? "Demonstration fixtures" : "Curated historical inventory"} · temporal comparison unavailable
          </span>
        </div>
      </DataGate>
    </div>
  );
}
