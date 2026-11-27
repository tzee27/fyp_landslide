import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Layers, Moon, Sun,
  Search,
  SlidersHorizontal,
  X,
  ArrowUpRight,
} from "lucide-react";
import TerrainMap, { type MapViewport, type Selection } from "../components/TerrainMap";
import { PageHeader, DemoNote, DataGate } from "../components/Common";
import { places, categoryScale, kindLabels } from "../mocks/data";
import { isDemo, useData } from "../app/DataProvider";
import { apiGet } from "../services/api";
import type { StaticAssessment } from "../types";
import { useNationalAssessment } from "../hooks/useNationalAssessment";
import { moderateMargin, susceptibilityColors, susceptibilityLevel } from "../services/susceptibilityDisplay";

import { environmentLayers } from "../services/environmentLayers";

import {useMapDates} from "../hooks/useMapDates";
import coverClasses from "../services/landCoverClasses.json";

import {nearbyEnvironment} from "../services/nearbyEnvironment";

function Measurements({values}:{values:Record<string,unknown>}){
  return <dl className="details-list">{Object.entries(values).filter(([,v])=>
    typeof v==="number"?Number.isFinite(v):typeof v==="string" && v.trim().length>0
  ).map(([name,v])=>{
    const label=name.replaceAll("_"," ");
    const cover=name==="landcover_pre_event_class"?coverClasses.find(c=>c.code===Number(v)):undefined;
    return <div key={name}><dt>{label}</dt><dd>{cover?.name ?? (typeof v==="number"?v.toLocaleString("en-MY",{maximumSignificantDigits:5}):String(v))}</dd></div>;
  })}</dl>;
}
export default function Explorer() {
  const { data } = useData();

  const params=new URLSearchParams(location.search);
  const coverYears=[2007,2008,2009,2010,2011,2012,2013,2014,2022];
  const requestedYear=Number(params.get("year"));
  const [coverYear,setCoverYear]=useState(coverYears.includes(requestedYear)?requestedYear:2022);
  const [referenceField, setReferenceField] = useState<string|undefined>(params.get("factor")??undefined);
  const [mapDate,setMapDate]=useState(params.get("date")??"");
  const mapDates=useMapDates();
  const dynamic=referenceField ? mapDates[referenceField] : undefined;
  const day=mapDate || Object.keys(dynamic??{}).sort().at(-1) || "";
  const mapMeta=dynamic?.[day];
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
  const [environmentOpacity,setEnvironmentOpacity]=useState(.85);
  const dynamicNames:Record<string,string>={rainfall:"Rainfall",moisture:"Surface soil moisture",runoff:"Surface runoff"};
  const available=isDemo?[]:[...environmentLayers,...Object.keys(mapDates).map(key=>({
    key,name:dynamicNames[key],group:"Dynamic conditions",range:"0–"+(mapMeta?.maximum??"")+"+",unit:mapMeta?.unit??"",
    source:[mapMeta?.source,day+" UTC",...(mapMeta?.status??[])].filter(Boolean).join(" · "),
    colors:mapMeta?.colors.join(",")??"",description:"Daily regional grid at approximately 10 km. Darker colours indicate higher values."
  }))];
  const chosen=available.find(l=>l.key===referenceField);
  const themeLabel=basemap==="Light"?"Switch to dark basemap":"Switch to light basemap";
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
  const [nearby,setNearby]=useState<Awaited<ReturnType<typeof nearbyEnvironment>>>();
  const [sampleError,setSampleError]=useState(false);
  const [cellError,setCellError]=useState(false);
  const selectedCellId = selection?.assessmentCellId;
  const selectedTile = selection?.tileId;
  useEffect(() => {
    setNationalCell(null);
    setCellError(false);
    if (!national || !selectedCellId || !selectedTile) return;
    const controller = new AbortController();
    apiGet<StaticAssessment["features"][number]>(
      `/api/national-static/${nationwide.resolution}/tiles/${selectedTile}/cells/${selectedCellId}`, controller.signal,
    ).then(result=>{if(!controller.signal.aborted)setNationalCell(result)}).catch(()=>{if(!controller.signal.aborted)setCellError(true)});
    return () => controller.abort();
  }, [national, selectedCellId, selectedTile, nationwide.resolution]);
  const cell = national && nationalCell?.id === selectedCellId ? nationalCell : null;
  useEffect(()=>{
    let current=true;
    setNearby(undefined);
    setSampleError(false);
    if(selection && !isDemo && (!national || !selectedCellId || cellError)){
      nearbyEnvironment(selection.coordinates).then(result=>{if(current)setNearby(result)})
        .catch(()=>{if(current)setSampleError(true)});
    }
    return ()=>{current=false};
  },[selection,national,selectedCellId,cellError]);
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
          <button className="map-theme-toggle" aria-label={themeLabel} title={themeLabel} onClick={()=>setBasemap(basemap==="Light"?"Dark":"Light")}>{basemap==="Light"?<Moon size={17}/>:<Sun size={17}/>}</button>
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
            environmentalField={dynamic?(mapMeta?referenceField+"-"+day:undefined):!chosen?undefined:referenceField==="cover"?"cover-"+coverYear:referenceField} environmentalOpacity={environmentOpacity}
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
              <h4>Model assessment</h4>
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
              <h4>Historical landslides</h4>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={records}
                  onChange={(e) => setRecords(e.target.checked)}
                />
                {isDemo ? "Demonstration records" : "Malaysia inventory (historical candidates)"}
              </label>
              {available.length>0 && <h4>Environmental overlays</h4>}
              {[...new Set(available.map(l=>l.group))].map(group=><details key={group}><summary>{group}</summary>{available.filter(l=>l.group===group).map(l=><label key={l.key} className="check-row"><input type="checkbox" checked={referenceField===l.key} onChange={e=>{setReferenceField(e.target.checked?l.key:undefined);setSelection(null)}}/>{l.name}</label>)}</details>)}
              {dynamic && <label>Observation date (UTC) <input type="date" value={day} onChange={e=>setMapDate(e.target.value)}/></label>}
              {chosen?.key==="cover" && <label>Reference year <select value={coverYear} onChange={e=>setCoverYear(Number(e.target.value))}>{coverYears.map(year=><option key={year}>{year}</option>)}</select></label>}
              {chosen && <><label className="range-label">Overlay opacity <input type="range" min="0" max="1" step=".05" value={environmentOpacity} onChange={e=>setEnvironmentOpacity(+e.target.value)}/></label>
              </>}
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
              <h2>{selection.incident?.title ?? (selection.clusterCount ? selection.clusterCount+" inventory records" : cell ? "Assessment cell" : "Selected location")}</h2>
              <p className="coordinates">
                {selection.coordinates[1].toFixed(5)}° N,{" "}
                {selection.coordinates[0].toFixed(5)}° E
              </p>
              {selection.incident && <p><span className="tag">{kindLabels[selection.incident.kind]}</span> <Link className="text-link" to={"/incidents?id="+selection.incident.id}>Read record and evidence ↗</Link></p>}
              {cell ? <>
                <p>{cell.properties.score!==null ? susceptibilityLevel(cell.properties.score)+" · SVM margin "+cell.properties.score.toFixed(4) : "This cell has environmental measurements but lacks a complete set of model inputs."}</p>
                {cell.properties.score===null && cell.properties.missing.length>0 && <p className="microcopy">Inputs preventing a score · {cell.properties.missing.map(name=>name.replaceAll("_"," ")).join(", ")}</p>}
                <small>Assessment cell sample · {assessment?.assessment.assessmentDate ?? "January 2023"}</small>
                <Measurements values={cell.properties.environment}/>
              </> : isDemo ? selection.category && <p>Synthetic susceptibility · {selection.category}</p>
              : national && selectedCellId && !cellError ? <p role="status">Loading assessment cell…</p>
              : nearby ? <><p>Nearby environmental sample · {nearby.distance.toLocaleString("en-MY",{maximumSignificantDigits:2})} km from selection</p>
                <small>January 2023 assessment grid · measurements at the sample location</small>
                <Measurements values={nearby.values}/>
              </> : <p role="status">{sampleError?"Environmental samples could not be loaded.":nearby===undefined?"Checking environmental coverage…":"No published environmental sample within the supported Malaysian land area at this location."}</p>}
            </aside>
          )}
          {chosen && <details key={chosen.key} open className="environment-legend"><summary>{chosen.group} · {chosen.name}</summary>
            {dynamic && !mapMeta?<p>No spatial export for this UTC day.</p>:<>{chosen.key==="cover"?<details><summary>Class colours</summary>{coverClasses.map(c=><div key={c.code} className="cover-class"><i style={{background:c.color}}/>{c.code} · {c.name}</div>)}</details>:<><div className="layer-gradient" style={{background:"linear-gradient(to right,"+chosen.colors+")"}}/>
            <strong>{chosen.range} {chosen.unit}</strong></>}<p>{chosen.description}</p><small>{chosen.source}{chosen.key==="cover" && " · "+coverYear}</small></>}
          </details>}
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
              {hasScores && <p className="legend-summary">Moderate means the model score is close to its cutoff of zero ({"\u2212"}{moderateMargin} to +{moderateMargin}). The score is a relative margin, not a probability.</p>}
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
