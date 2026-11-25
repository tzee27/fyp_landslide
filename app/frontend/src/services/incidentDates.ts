import type { Incident } from "../types";

export function occurrenceNewestFirst(a: Incident, b: Incident): number {
  const occurrenceOrder = (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "");
  if (occurrenceOrder || a.occurredAt) return occurrenceOrder;
  return (b.reportedAt ?? "").localeCompare(a.reportedAt ?? "");
}
