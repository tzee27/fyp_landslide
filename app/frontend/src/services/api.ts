import type { DashboardPayload, Prediction } from "../types";
import { incidents, sources } from "../mocks/data";
const base = import.meta.env.VITE_API_BASE_URL?.replace(/[/]$/, "");
export const isDemo = import.meta.env.VITE_DATA_MODE !== "api";
export async function apiGet<T>(
  route: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!base) throw new Error("API base URL is not configured.");
  const response = await fetch(base + route, { signal });
  if (!response.ok)
    throw new Error("API request failed (" + response.status + ").");
  return response.json();
}
export async function loadDashboard(
  signal?: AbortSignal,
): Promise<DashboardPayload> {
  if (isDemo) return { incidents, sources };
  const result = await apiGet<DashboardPayload>("/api/dashboard", signal);
  if (!Array.isArray(result.incidents) || !Array.isArray(result.sources))
    throw new Error("Unexpected dashboard API response.");
  return result;
}
export async function inspectLocation(
  coordinates: [number, number],
): Promise<Prediction> {
  if (isDemo)
    return {
      coordinates,
      score: null,
      category: null,
      timestamp: null,
      demo: true,
    };
  return apiGet<Prediction>(
    "/api/predictions?lng=" + coordinates[0] + "&lat=" + coordinates[1],
  );
}
// Raw collector routes are deliberately separate from processed dashboard contracts.
export const collector = {
  health: () => apiGet<unknown>("/health"),
  reports: () => apiGet<unknown>("/api/reports"),
  overlaps: () => apiGet<unknown>("/api/overlaps"),
  runs: () => apiGet<unknown>("/api/runs"),
};
