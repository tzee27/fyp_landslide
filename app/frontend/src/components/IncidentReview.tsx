import { useState, type FormEvent } from "react";
import { approveIncident } from "../services/api";
import type { Incident } from "../types";

export default function IncidentReview({ record, onApproved }: {
  record: Incident;
  onApproved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await approveIncident(record.id, {
        occurrence_date: form.get("date"),
        longitude: Number(form.get("lng")),
        latitude: Number(form.get("lat")),
        location_evidence: form.get("evidence"),
        review_notes: form.get("notes"),
        distinct_occurrence_reviewed: form.has("distinct"),
      });
      onApproved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Review could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="filterbar incident-review" onSubmit={submit}>
      <h3>Complete occurrence review</h3>
      <label>Occurrence date<input type="date" name="date" max={record.reportedAt ?? undefined} required /></label>
      <label>Longitude<input type="number" name="lng" step="any" min="-180" max="180" required /></label>
      <label>Latitude<input type="number" name="lat" step="any" min="-90" max="90" required /></label>
      <label>Location evidence URL<input type="url" name="evidence" required /></label>
      <label>Review notes<textarea name="notes" maxLength={2000} required /></label>
      <label className="review-confirmation"><input type="checkbox" name="distinct" required /> I checked the source evidence and confirmed this is a distinct occurrence.</label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? "Saving review…" : "Add to New inventory"}</button>
    </form>
  );
}
