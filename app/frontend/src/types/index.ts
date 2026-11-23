export type RecordKind =
  "reported-area" | "verified-point" | "historical" | "news-lead";
export interface Evidence {
  publisher: string;
  title: string;
  url?: string;
  classification:
    "New occurrence" | "Follow-up report" | "Retrospective article";
}
export interface Incident {
  id: string;
  title: string;
  state: string;
  district: string;
  locality: string;
  reportedAt: string;
  occurredAt: string | null;
  kind: RecordKind;
  precision: string;
  coordinates: [number, number] | null;
  locator: [number, number];
  description: string;
  impacts: string;
  evidence: Evidence[];
  demo: boolean;
}
export interface Prediction {
  coordinates: [number, number];
  score: number | null;
  category: string | null;
  timestamp: string | null;
  demo: boolean;
}
export interface EnvironmentalLayer {
  id: string;
  name: string;
  group: string;
  status: "demo" | "not-configured";
  unit?: string;
  temporal: boolean;
}
export interface SourceFreshness {
  name: string;
  purpose: string;
  status: "Not configured" | "Available" | "Review required";
  updatedAt: string | null;
  url: string;
}
export interface ModelResult {
  name: string;
  version: string | null;
  auc: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  status: string;
}
export interface SeriesPoint {
  day: string;
  rainfall: number;
  antecedent: number;
  moisture: number;
}
export interface DashboardPayload {
  incidents: Incident[];
  sources: SourceFreshness[];
}
