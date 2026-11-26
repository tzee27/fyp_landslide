import type { DashboardPayload, Prediction } from "../types";
import { incidents, sources } from "../mocks/data";
const base = import.meta.env.VITE_API_BASE_URL?.replace(/[/]$/, "") ?? "";
export const isDemo = import.meta.env.VITE_DATA_MODE === "demo";
export async function apiGet<T>(
  route: string,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(base + route, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(typeof result?.detail === "string" ? result.detail : "API request failed (" + response.status + ").");
  }
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
  return { coordinates, score: null, category: null, timestamp: null, demo: isDemo };
}

export async function approveIncident(id: string, fields: Record<string, unknown>) {
  const response = await fetch(base + "/api/incident-updates/" + encodeURIComponent(id) + "/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(typeof result?.detail === "string" ? result.detail : "Review could not be saved. Check the required fields.");
  }
}
