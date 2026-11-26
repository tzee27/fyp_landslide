import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Layers,
  Search,
  SlidersHorizontal,
  X,
  ArrowUpRight,
} from "lucide-react";
import TerrainMap, { type MapViewport, type Selection } from "../components/TerrainMap";
import { PageHeader, DemoNote, DataGate } from "../components/Common";
import { places, layers, categoryScale, kindLabels } from "../mocks/data";
import { isDemo, useData } from "../app/DataProvider";
import { apiGet } from "../services/api";
import type { StaticAssessment } from "../types";
import { useNationalAssessment } from "../hooks/useNationalAssessment";
import { moderateMargin, susceptibilityColors, susceptibilityLevel } from "../services/susceptibilityDisplay";

export default function Explorer() {
  const { data } = useData();
  const [national, setNational] = useState(!isDemo);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [nationalCell, setNationalCell] = useState<StaticAssessment["features"][number] | null>(null);
  const [basemap, setBasemap] = useState("Light"),
    [opacity, setOpacity] = useState(0.65),
    [zones, setZones] = useState(isDemo),
    [records, setRecords] = useState(true),
    [panel, setPanel] = useState(true),
    [place, setPlace] = useState(places[0]),
    [selection, setSelection] = useState<Selection | null>(null),
    [search, setSearch] = useState("");
  const groups = [...new Set(layers.map((l) => l.group))];
  const locations = useMemo(() => {
    const choices = new Map(places.map((place) => [place.name, place]));
    for (const record of data?.incidents ?? []) {
      if (!record.coordinates || record.demo) continue;
      for (const name of [record.state, `${record.district}, ${record.state}`, `${record.locality}, ${record.state}`]) {
        if (!name || name.toLowerCase().includes("unknown") || choices.has(name)) continue;
        choices.set(name, { name, center: record.coordinates, zoom: name === record.state ? 8 : 10 });
      }
    }
    return [...choices.values()];
  }, [data?.incidents]);
  const searchResults = search.trim()
    ? locations.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];
  const nationwide = useNationalAssessment(!isDemo, national, viewport);
  const assessment = nationwide.assessment;
  const selectedCellId = selection?.assessmentCellId;
  const selectedTile = selection?.tileId;
  useEffect(() => {
    setNationalCell(null);
    if (!national || !selectedCellId || !selectedTile) return;
    const controller = new AbortController();
    apiGet<StaticAssessment["features"][number]>(
      `/api/national-static/${nationwide.resolution}/tiles/${selectedTile}/cells/${selectedCellId}`, controller.signal,
    ).then(setNationalCell).catch(() => {});
    return () => controller.abort();
  }, [national, selectedCellId, selectedTile, nationwide.resolution]);
  const cell = national && nationalCell?.id === selectedCellId ? nationalCell : null;
  const showsAssessment = national;
  const hasScores = Boolean(showsAssessment && assessment?.assessment.scoredCells);
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
          : hasScores ? "The map displays relative SVM margins. These are not calibrated probabilities."
            : !showsAssessment ? "Points show historical inventory candidates."
            : "Model-generated susceptibility is unavailable."}
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
                  {searchResults.map((p) => (
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
                {!searchResults.length && <p>No matches in the curated location index.</p>}
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
            assessment={showsAssessment ? assessment : null}
            onViewport={setViewport}
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
                  checked={isDemo ? zones : national}
                  disabled={!isDemo && !nationwide.available}
                  onChange={(e) => {
                    if (isDemo) setZones(e.target.checked);
                    else setNational(e.target.checked);
                    setSelection(null);
                  }}
                />
                {isDemo ? "Synthetic patches" : "Malaysia susceptibility"}
              </label>
              <label className="range-label">
                Opacity <span>{Math.round(opacity * 100)}%</span>
                <input
                  aria-label="Susceptibility opacity"
                  disabled={isDemo ? !zones : !national || !nationwide.available}
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
                {isDemo ? "Demonstration records" : "Malaysia inventory (historical candidates)"}
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
              <h2>{cell ? "Assessment cell" : selection.incident?.title ?? "Selected location"}</h2>
              <p className="coordinates">
                {selection.coordinates[1].toFixed(5)}° N,{" "}
                {selection.coordinates[0].toFixed(5)}° E
              </p>
              {cell && assessment ? (
                <>
                  <p>{cell.properties.score !== null ? `${susceptibilityLevel(cell.properties.score)} · SVM margin ${cell.properties.score?.toFixed(4)}` : "Unscored assessment cell"}</p>
                  <p>{assessment.assessment.model} · {assessment.assessment.assessmentDate}</p>
                  {cell.properties.missing.length > 0 && <p>Missing or unsupported: {cell.properties.missing.join(", ")}</p>}
                  <dl className="details-list">
                    {Object.entries(cell.properties.environment).map(([name, value]) => (
                      <div key={name}><dt>{name}</dt><dd>{typeof value === "number" ? value.toFixed(4) : value ?? "Unavailable"}</dd></div>
                    ))}
                  </dl>
                </>
              ) : selection.incident ? (
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
        </div>
        <div className="map-legend">
          <span className="eyebrow">
            {zones ? "SYNTHETIC SUSCEPTIBILITY" : isDemo ? "SYNTHETIC PATCHES HIDDEN" : hasScores ? "RELATIVE SUSCEPTIBILITY" : national ? "SUSCEPTIBILITY UNAVAILABLE" : "MAP LEGEND"}
          </span>
          {showsAssessment && assessment && (
            <>
              <div className="legend-scale">
                {Object.entries(susceptibilityColors)
                  .filter(([level]) => hasScores || level === "Unscored")
                  .map(([level, color]) => (
                    <div key={level}><span style={{ background: color }} />{level}</div>
                  ))}
              </div>
              <p className="legend-summary">
                {national && (nationwide.resolution === 500 ? "500 m detail · " : "10 km overview · ")}
                {assessment.assessment.scoredCells.toLocaleString("en-MY")} of {assessment.assessment.totalCells.toLocaleString("en-MY")} cells scored · {assessment.assessment.assessmentDate}
              </p>
              {hasScores && <p className="legend-summary">Moderate covers SVM margins from ?{moderateMargin} to +{moderateMargin}.</p>}
            </>
          )}
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
          {records && <div className="record-legend">
            <span>● {isDemo ? "Sample point" : "Candidate point"}</span>
            {isDemo && <span>◯ Approximate area</span>}
            <span>◉ Record cluster</span>
          </div>}
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
