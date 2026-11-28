import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { demoZones } from "../mocks/data";
import type { Incident, StaticAssessment } from "../types";
import { susceptibilityColors, susceptibilityLevel } from "../services/susceptibilityDisplay";

maplibregl.setWorkerUrl(mapWorkerUrl);
export interface Selection {
  coordinates: [number, number];
  category?: string;
  clusterCount?: number;
  score?: number;
  incident?: Incident;
  assessmentCellId?: string;
  tileId?: string;
}
export interface MapViewport { bounds: [number, number, number, number]; zoom: number }
interface Props {
  basemap?: string;
  opacity?: number;
  showZones?: boolean;
  showRecords?: boolean;
  place?: { center: [number, number]; zoom: number };
  incidents: Incident[];
  onSelect?: (selection: Selection) => void;
  compact?: boolean;
  assessment?: StaticAssessment | null;
  onViewport?: (viewport: MapViewport) => void;

  environmentalLayers?: {field:string;opacity:number;image?:string;coordinates?:[[number,number],[number,number],[number,number],[number,number]]}[];
  inventoryOpacity?:number;
}
const tiles: Record<string, { url: string; attribution: string }> = {
  Dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri, HERE, Garmin, OpenStreetMap contributors",
  },
  Light: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  },
  Satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — imagery providers",
  },
  Terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — topographic basemap",
  },
};
export default function TerrainMap({
  basemap = "Light",
  opacity = 0.65,
  showZones = true,
  showRecords = true,
  place,
  incidents,
  onSelect,
  compact = false,
  assessment,
  onViewport,

  environmentalLayers,
  inventoryOpacity=1,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const viewportCallback = useRef(onViewport);
  viewportCallback.current = onViewport;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const records = useRef(incidents);
  records.current = incidents;
  useEffect(() => {
    if (!container.current) return;
    let m: MapInstance;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: Object.fromEntries(
            Object.entries(tiles).map(([id, t]) => [
              id,
              {
                type: "raster",
                tiles: [t.url],
                tileSize: 256,
                attribution: t.attribution,
              },
            ]),
          ),
          layers: Object.keys(tiles).map((id) => ({
            id: "base-" + id,
            type: "raster" as const,
            source: id,
            layout: {
              visibility:
                id === basemap ? ("visible" as const) : ("none" as const),
            },
          })),
        },
        center: [109.5, 4],
        zoom: compact ? 4 : 4.7,
        minZoom: 3,
        maxZoom: 17,
        attributionControl: { compact: true },
      });
      map.current = m;
    } catch {
      setError(
        "WebGL could not initialise. Use location search and the record list to explore the demonstration.",
      );
      return;
    }
    m.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    m.addControl(new maplibregl.ScaleControl(), "bottom-left");
    const reportViewport = () => {
      const bounds = m.getBounds();
      viewportCallback.current?.({
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom: m.getZoom(),
      });
    };
    m.on("moveend", reportViewport);
    m.on("error", () =>
      setError(
        "Some map tiles could not load. Check your internet connection; local demo overlays remain available.",
      ),
    );
    // Local count icons work on raster basemaps without a glyph server.
    m.on("styleimagemissing",({id})=>{
      if(!/^inventory-count-\d+$/.test(id) || m.hasImage(id))return;
      const count=id.slice("inventory-count-".length);
      const canvas=document.createElement("canvas");
      canvas.width=canvas.height=56;
      const ctx=canvas.getContext("2d");
      if(!ctx)return;
      ctx.font="bold "+(count.length>3?17:21)+"px sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#122c31";
      ctx.fillText(count,28,28,49);
      m.addImage(id,ctx.getImageData(0,0,56,56),{pixelRatio:2});
    });
    m.on("load", () => {
      m.addSource("static-assessment", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "static-assessment-fill", type: "fill", source: "static-assessment",
        paint: {
          "fill-color": ["match", ["get", "displayLevel"], "Lower", susceptibilityColors.Lower, "Moderate", susceptibilityColors.Moderate, "Higher", susceptibilityColors.Higher, susceptibilityColors.Unscored],
          "fill-opacity": ["match", ["get", "displayLevel"], "Unscored", 0.14, 0.65],
        },
      });
      m.addLayer({
        id: "static-assessment-outline", type: "line", source: "static-assessment",
        paint: { "line-color": "#64706b", "line-opacity": 0.65, "line-width": 0.8 },
      });
      m.addSource("zones", { type: "geojson", data: demoZones });
      m.addLayer({
        id: "zones",
        type: "fill",
        source: "zones",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.65 },
      });
      m.addLayer({
        id: "zone-lines",
        type: "line",
        source: "zones",
        paint: { "line-color": ["get", "color"], "line-width": 1 },
      });
      m.addSource("records", {
        type: "geojson",
        data: recordGeo(records.current),
        cluster: true,
        clusterRadius: 35,
        clusterMaxZoom: 8,
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "records",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": 13,
          "circle-color": "#719aaa",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f0ede6",
        },
      });
      m.addLayer({
        id: "points",
        type: "circle",
        source: "records",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "precision"], "point"],
        ],
        paint: {
          "circle-radius": 6,
          "circle-color": "#d7ac77",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fffcf7",
        },
      });
      m.addLayer({
        id: "areas",
        type: "circle",
        source: "records",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "precision"], "area"],
        ],
        paint: {
          "circle-radius": 19,
          "circle-color": "#719aaa",
          "circle-opacity": 0.12,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#719aaa",
        },
      });
      m.addLayer({id:"cluster-counts",type:"symbol",source:"records",filter:["has","point_count"],layout:{"icon-image":["concat","inventory-count-",["to-string",["get","point_count"]]],"icon-allow-overlap":true,"icon-ignore-placement":true}});
      fetch("/data/malaysia.json")
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((data) => {
          if (!map.current) return;
          m.addSource("malaysia", { type: "geojson", data });
          m.addLayer({
            id: "malaysia-outline",
            type: "line",
            source: "malaysia",
            paint: {
              "line-color": "#517a62",
              "line-width": 1,
              "line-opacity": 0.65,
            },
          });
        })
        .catch(() =>
          setError(
            "Country outline unavailable. Basemap boundaries may still be visible.",
          ),
        );
      setReady(true);
      reportViewport();
    });
    m.on("click", (e) => {
      const features = m.queryRenderedFeatures(e.point, {
        layers: ["points", "areas", "clusters", "zones", "static-assessment-fill"].filter((id) =>
          m.getLayer(id),
        ),
      });
      const cluster = features.find((f) => f.layer.id === "clusters");
      if (cluster) {
        m.easeTo({ center: e.lngLat, zoom: m.getZoom() + 2 });
      }
      const record = features.find((f) => f.properties.id);
      const zone = features.find((f) => f.layer.id === "zones");
      const assessmentCell = features.find((f) => f.layer.id === "static-assessment-fill");
      callback.current?.({
        coordinates: [e.lngLat.lng, e.lngLat.lat],
        clusterCount: cluster?.properties.point_count,
        category: zone?.properties.label,
        score: zone?.properties.score,
        assessmentCellId: assessmentCell?.properties.cellId,
        tileId: assessmentCell?.properties.tileId,
        incident: record
          ? records.current.find((i) => i.id === record.properties.id)
          : undefined,
      });
    });
    return () => {
      map.current = null;
      m.remove();
    };
  }, []);
  const displayed=useRef(new Map<string,string>());
  useEffect(()=>{
    const m=map.current;
    if(!ready||!m)return;
    const active=new Set<string>();
    for(const layer of environmentalLayers??[]){
      const field=layer.field;
      const line=field==="roads"||field==="rivers";
      const parts=layer.image||line?[""]:["west","east"];
      for(const part of parts){
        const id="environment-"+field+"-"+part;
        active.add(id);
        const url=layer.image??import.meta.env.BASE_URL+"data/"+field+(line?".geojson":"-"+part+".png");
        if(displayed.current.get(id)!==url&&m.getLayer(id)){m.removeLayer(id);m.removeSource(id)}
        if(!m.getLayer(id)){
          if(line){
            m.addSource(id,{type:"geojson",data:url});
            m.addLayer({id,type:"line",source:id,paint:{"line-color":field==="roads"?"#985a41":"#3e7398","line-width":1.4}},"clusters");
          }else{
            const [west,east]=part==="west"?[99,105]:[109,120];
            m.addSource(id,{type:"image",url,coordinates:layer.coordinates??[[west,8],[east,8],[east,0],[west,0]]});
            m.addLayer({id,type:"raster",source:id,paint:{"raster-resampling":/^(cover|rainfall|runoff|moisture)/.test(field)?"nearest":"linear"}},"clusters");
          }
          displayed.current.set(id,url);
        }
        m.setPaintProperty(id,line?"line-opacity":"raster-opacity",layer.opacity);
      }
    }
    for(const id of displayed.current.keys())if(!active.has(id)){
      if(m.getLayer(id))m.removeLayer(id);
      if(m.getSource(id))m.removeSource(id);
      displayed.current.delete(id);
    }
  },[ready,environmentalLayers]);
  useEffect(()=>{
    const m=map.current;
    if(!ready||!m)return;
    for(const id of ["points","areas","clusters"]){
      m.setPaintProperty(id,"circle-opacity",inventoryOpacity*(id==="areas"?.12:1));
      m.setPaintProperty(id,"circle-stroke-opacity",inventoryOpacity);
    }
    m.setPaintProperty("cluster-counts","icon-opacity",inventoryOpacity);
  },[ready,inventoryOpacity]);
  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("static-assessment") as maplibregl.GeoJSONSource).setData(
      {
        type: "FeatureCollection",
        features: assessment?.features.map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            displayLevel: susceptibilityLevel(feature.properties.score),
          },
        })) ?? [],
      },
    );
  }, [assessment, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    Object.keys(tiles).forEach((id) =>
      m.setLayoutProperty(
        "base-" + id,
        "visibility",
        id === basemap ? "visible" : "none",
      ),
    );
    ["zones", "zone-lines"].forEach((id) =>
      m.setLayoutProperty(id, "visibility", showZones ? "visible" : "none"),
    );
    m.setPaintProperty("zones", "fill-opacity", opacity);
    m.setPaintProperty("zone-lines","line-opacity",opacity);
    m.setPaintProperty("static-assessment-outline","line-opacity",opacity);
    m.setPaintProperty("static-assessment-fill", "fill-opacity", [
      "match", ["get", "displayLevel"], "Unscored", opacity * (0.14 / 0.65), opacity,
    ]);
    ["points", "areas", "clusters", "cluster-counts"].forEach((id) =>
      m.setLayoutProperty(id, "visibility", showRecords ? "visible" : "none"),
    );
    (m.getSource("records") as maplibregl.GeoJSONSource).setData(
      recordGeo(incidents),
    );
  }, [ready, basemap, opacity, showZones, showRecords, incidents]);
  useEffect(() => {
    if (ready && place)
      map.current?.easeTo({
        center: place.center,
        zoom: place.zoom,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 900,
      });
  }, [ready, place]);
  return (
    <div className={compact ? "map-shell compact" : "map-shell"}>
      <div ref={container} className="map-canvas" />
      {error && (
        <div className="map-error" role="status">
          {error}
          <button aria-label="Dismiss map notice" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <div className="map-watermark">
        MALAYSIA <span>/ GEOGRAPHIC CONTEXT</span>
      </div>
    </div>
  );
}
function recordGeo(records: Incident[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: records.flatMap((i): GeoJSON.Feature[] => {
      const coordinates = i.coordinates ?? i.locator;
      if (!coordinates || i.kind === "news-lead") return [];
      return [{
        type: "Feature",
        properties: { id: i.id, precision: i.coordinates ? "point" : "area" },
        geometry: { type: "Point", coordinates },
      }];
    }),
  };
}
