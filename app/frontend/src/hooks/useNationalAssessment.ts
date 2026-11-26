import { useEffect, useState } from "react";
import type { MapViewport } from "../components/TerrainMap";
import type { StaticAssessment } from "../types";
import { apiGet } from "../services/api";

interface Coverage {
  assessmentDate: string;
  scoredCells: number;
  plannedCells: number;
  modelVersion: string;
  tiles: { id: string; bounds: MapViewport["bounds"]; processed: boolean; scored: number }[];
}

function intersects(a: MapViewport["bounds"], b: MapViewport["bounds"]) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

export function useNationalAssessment(enabled: boolean, visible: boolean, viewport: MapViewport | null) {
  const [overview, setOverview] = useState<Coverage | null>(null);
  const [detail, setDetail] = useState<Coverage | null>(null);
  const [assessment, setAssessment] = useState<StaticAssessment | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiGet<Coverage>("/api/national-static/10000/coverage", controller.signal).then(setOverview).catch(() => {});
    apiGet<Coverage>("/api/national-static/500/coverage", controller.signal).then(setDetail).catch(() => {});
    return () => controller.abort();
  }, [enabled]);
  const detailed = Boolean(viewport && viewport.zoom >= 11 && detail?.tiles.some((tile) => {
    if (!tile.scored) return false;
    const [west, south, east, north] = viewport.bounds;
    const x = (west + east) / 2;
    const y = (south + north) / 2;
    return intersects([x, y, x, y], tile.bounds);
  }));
  const resolution = detailed ? 500 : 10000;
  const coverage = detailed ? detail : overview;
  useEffect(() => {
    if (!visible || !viewport || !coverage?.scoredCells) return;
    const controller = new AbortController();
    const tiles = coverage.tiles.filter((tile) => tile.processed && intersects(tile.bounds, viewport.bounds));
    setAssessment(null);
    async function load() {
      const features: StaticAssessment["features"] = [];
      // A limited number of parallel requests avoids opening every map tile at once.
      for (let offset = 0; offset < tiles.length && !controller.signal.aborted; offset += 8) {
        const results = await Promise.allSettled(tiles.slice(offset, offset + 8).map((tile) =>
          apiGet<StaticAssessment>(`/api/national-static/${resolution}/tiles/${tile.id}`, controller.signal),
        ));
        for (const result of results) {
          if (result.status === "fulfilled") features.push(...result.value.features);
        }
      }
      if (!controller.signal.aborted && coverage) setAssessment({
        type: "FeatureCollection",
        features,
        assessment: {
          assessmentDate: coverage.assessmentDate, model: "Balanced linear SVM",
          modelVersion: coverage.modelVersion, scoredCells: coverage.scoredCells, totalCells: coverage.plannedCells,
          rule: "Lower: score < 0; Higher: score ≥ 0.",
        },
      });
    }
    void load();
    return () => controller.abort();
  }, [visible, viewport, coverage, resolution]);
  return { available: Boolean(overview?.scoredCells), assessment, resolution };
}
