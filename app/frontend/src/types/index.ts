export type RecordKind =
  "reported-area" | "verified-point" | "historical" | "news-lead" | "new-inventory";
export interface Evidence {
  publisher: string;
  title: string;
  url?: string;
  classification:
    "New occurrence" | "Reported occurrence" | "Follow-up report" | "Retrospective article" | "Review evidence";
}
export interface Incident {
  id: string;
  title: string;
  state: string;
  district: string;
  locality: string;
  reportedAt: string | null;
  occurredAt: string | null;
  kind: RecordKind;
  precision: string;
  coordinates: [number, number] | null;
  locator: [number, number] | null;
  description: string;
  impacts: string;
  evidence: Evidence[];
  demo: boolean;
  reviewNotes?: string;
  sourceImage?: { url: string; credit: string; articleUrl: string };
  verificationStatus?: "VERIFIED" | "PARTIALLY_VERIFIED" | "PENDING_REVIEW";
  inventory?: {
    source: string;
    sourceRecordId: string;
    datePrecision: string;
    originalDateValue: string | null;
    curationStatus: string;
    coordinateStatus: string;
    verifiedUniqueEvent: boolean;
    modelUseStatus: string;
  };
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
  url: string | null;
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
  pendingUpdates?: Incident[];
  collectionUpdatedAt?: string | null;
  pilotGridCellCount?: number | null;
  pilotFeatureCoverage?: { completeCells: number } | null;
  sources: SourceFreshness[];
  modelEvaluation?: {
    branch: "static" | "temporal";
    folds: number;
    rocAuc: number;
    prAuc: number;
    precision: number;
    recall: number;
    f1: number;
  }[] | null;
}
export interface PilotCell {
  cellId: string;
  tileId?: string;
  score: number | null;
  category: "Lower" | "Higher" | null;
  missing: string[];
  environment: Record<string, number | string | null>;
}

export interface StaticAssessment extends GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, PilotCell> {
  assessment: {
    assessmentDate: string;
    model: string;
    modelVersion: string;
    scoredCells: number;
    totalCells: number;
    rule: string;
  };
}
