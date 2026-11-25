import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { demoZones } from "../mocks/data";
import type { Incident } from "../types";
maplibregl.setWorkerUrl(mapWorkerUrl);
export interface Selection {
  coordinates: [number, number];
  category?: string;
  score?: number;
  incident?: Incident;
}
interface Props {
  basemap?: string;
  opacity?: number;
  showZones?: boolean;
  showRecords?: boolean;
  place?: { center: [number, number]; zoom: number };
  incidents: Incident[];
  onSelect?: (selection: Selection) => void;
  compact?: boolean;
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
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
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
    m.on("error", () =>
      setError(
        "Some map tiles could not load. Check your internet connection; local demo overlays remain available.",
      ),
    );
    m.on("load", () => {
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
    });
    m.on("click", (e) => {
      const features = m.queryRenderedFeatures(e.point, {
        layers: ["points", "areas", "clusters", "zones"].filter((id) =>
          m.getLayer(id),
        ),
      });
      const cluster = features.find((f) => f.layer.id === "clusters");
      if (cluster) {
        m.easeTo({ center: e.lngLat, zoom: m.getZoom() + 2 });
        return;
      }
      const record = features.find((f) => f.properties.id);
      const zone = features.find((f) => f.layer.id === "zones");
      callback.current?.({
        coordinates: [e.lngLat.lng, e.lngLat.lat],
        category: zone?.properties.label,
        score: zone?.properties.score,
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
    ["points", "areas", "clusters"].forEach((id) =>
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
