import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { isDemo, useData } from "../app/DataProvider";
import { PageHeader, DemoNote, DataGate } from "../components/Common";
import { kindLabels } from "../mocks/data";
import TerrainMap from "../components/TerrainMap";
import IncidentReview from "../components/IncidentReview";
import { occurrenceNewestFirst } from "../services/incidentDates";
export default function Incidents() {
  const { data, refresh, loading } = useData();
  const [params, setParams] = useSearchParams();
  const reviewing = !isDemo && params.get("tab") === "updates";
  const [state, setState] = useState("All states"),
    [kind, setKind] = useState("All record types"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const all = useMemo(
    () => [...((reviewing ? data?.pendingUpdates : data?.incidents) ?? [])].sort(occurrenceNewestFirst),
    [data, reviewing],
  );
  function showSection(updates: boolean, id?: string) {
    setState("All states");
    setKind("All record types");
    setSearch("");
    setFrom("");
    setTo("");
    setParams({ ...(updates ? { tab: "updates" } : {}), ...(id ? { id } : {}) });
  }
  const kinds = [...new Set(all.map((i) => i.kind))];
  const filtered = all.filter(
    (i) => {
      const date = i.occurredAt ?? i.reportedAt ?? "";
      return (
        (state === "All states" || i.state === state) &&
        (kind === "All record types" || i.kind === kind) &&
        (!from || date >= from) &&
        (!to || (date !== "" && date <= to)) &&
        [i.title, i.district, i.inventory?.source, ...i.evidence.map((e) => e.publisher)]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    },
  );
  const selected =
    filtered.find((i) => i.id === params.get("id")) ?? filtered[0];
  return (
    <div className="page">
      <PageHeader
        number="04"
        title="Incident Monitor"
        description="Occurrences, reports and evidence. A distinction that matters."
      >
        <button onClick={refresh} disabled={loading}>
          <RefreshCw size={14} /> Reload data
        </button>
      </PageHeader>
      {!isDemo && <nav className="filterbar" aria-label="Incident Monitor sections">
        <button type="button" aria-pressed={!reviewing} onClick={() => showSection(false)}>Report Notebook</button>
        <button type="button" aria-pressed={reviewing} onClick={() => showSection(true)}>
          Updates to review ({data?.pendingUpdates?.length ?? 0})
        </button>
      </nav>}
      <DemoNote>
        {isDemo
          ? "Demonstration notebook with synthetic records."
          : reviewing
            ? "Sourced landslide leads awaiting occurrence, location and duplicate review."
            : "Historical inventory and reviewed additions. New inventory records are excluded from model training."}
      </DemoNote>
      <div className="collector-strip">
        <span>
          Collector <b>Not configured</b>
        </span>
        <span>
          {reviewing ? "Latest reported occurrence" : "Latest occurrence date"} <b>{all[0]?.occurredAt ?? "Not available"}</b>
        </span>
        <span>
          Duplicate screening <b>{isDemo ? "Demo" : "Curated review status"}</b>
        </span>
        <span>
          {isDemo ? "Demo records" : reviewing ? "Pending updates" : "Notebook records"} <b>{all.length}</b>
        </span>
      </div>
      <div className="filterbar incident-filters">
        <label>
          Find a report
          <input
            placeholder="Locality, district or source"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          State
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option>All states</option>
            {[...new Set(all.map((i) => i.state))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Record type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option>All record types</option>
            {kinds.map((key) => (
              <option value={key} key={key}>
                {kindLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Record date from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Record date to
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <DataGate>
        <div className="incidents-grid">
          <section className="incident-list">
            <div className="list-heading">
              <span className="eyebrow">{reviewing ? "UPDATES TO REVIEW" : "REPORT NOTEBOOK"}</span>
              <span>{filtered.length} records · Newest occurrence first</span>
            </div>
            {filtered.length === 0 ? (
              <div className="empty">
                <h3>No matching reports</h3>
                <p>Try a broader date range or another location.</p>
                <button
                  onClick={() => {
                    setState("All states");
                    setKind("All record types");
                    setSearch("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filtered.map((i) => (
                <button
                  className={
                    "incident-item " + (selected?.id === i.id ? "selected" : "")
                  }
                  onClick={() => setParams({ ...(reviewing ? { tab: "updates" } : {}), id: i.id })}
                  key={i.id}
                >
                  <div className="incident-item-meta">
                    <span className={"record-symbol " + i.kind} />
                    <span>{kindLabels[i.kind]}</span>
                    <time>{i.occurredAt ?? i.reportedAt ?? "Date unavailable"}</time>
                  </div>
                  <h3>{i.title}</h3>
                  <p>
                    {i.district}, {i.state}
                  </p>
                  <small>
                    {i.evidence.length} evidence references{" "}
                    <span>{i.inventory?.source ?? i.evidence[0]?.publisher ?? "Demo record"}</span>
                  </small>
                </button>
              ))
            )}
          </section>
          {selected && (
            <article className="incident-detail">
              <span className="eyebrow">
                RECORD / {selected.id.toUpperCase()}
              </span>
              <h2>{selected.title}</h2>
              <div className="tag-row">
                <span className="tag">{kindLabels[selected.kind]}</span>
                {selected.demo && <span className="tag sand">Demonstration</span>}
              </div>
              <p>{selected.description}</p>
              {selected.locator && <TerrainMap
                key={selected.id}
                compact
                incidents={[selected]}
                showZones={false}
                place={{
                  center: selected.locator,
                  zoom: selected.coordinates ? 9 : 8,
                }}
              />}
              <p className="microcopy">
                {selected.demo
                  ? "Demonstration marker. Area locators are approximate."
                  : selected.coordinates
                    ? selected.kind === "new-inventory" ? "Reviewer-supplied location." : "Candidate coordinate from the curated inventory."
                    : "A displayable candidate point is unavailable."}
              </p>
              <dl className="details-list">
                <div>
                  <dt>Reported date</dt>
                  <dd>{selected.reportedAt ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>{reviewing ? "Occurrence date as reported" : "Occurrence date"}</dt>
                  <dd>
                    {selected.occurredAt
                      ? selected.occurredAt + (selected.inventory ? " · " + selected.inventory.datePrecision : "")
                      : selected.inventory?.originalDateValue
                        ? selected.inventory.originalDateValue + " · " + selected.inventory.datePrecision
                        : "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Location precision</dt>
                  <dd>{selected.precision}</dd>
                </div>
                <div>
                  <dt>Candidate coordinates</dt>
                  <dd>
                    {selected.coordinates
                      ? selected.coordinates.join(", ")
                      : "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Reported impacts</dt>
                  <dd>{selected.impacts}</dd>
                </div>
                <div>
                  <dt>First seen / last updated</dt>
                  <dd>Not connected</dd>
                </div>
                <div>
                  <dt>Research model-use status</dt>
                  <dd>{selected.inventory?.modelUseStatus.replaceAll("_", " ") ?? (selected.demo ? "Demonstration data" : "Excluded from model training")}</dd>
                </div>
                {selected.inventory && <>
                  <div><dt>Source record</dt><dd>{selected.inventory.sourceRecordId}</dd></div>
                  <div><dt>Curation status</dt><dd>{selected.inventory.curationStatus.replaceAll("_", " ")}</dd></div>
                  <div><dt>Coordinate status</dt><dd>{selected.inventory.coordinateStatus.replaceAll("_", " ")}</dd></div>
                  <div><dt>Verified unique event</dt><dd>{selected.inventory.verifiedUniqueEvent ? "Yes" : "No"}</dd></div>
                </>}
              </dl>
              <h3 className="evidence-heading">Evidence & related coverage</h3>
              {selected.evidence.length ? (
                selected.evidence.map((e, i) => (
                  <div className="evidence" key={i}>
                    <div>
                      <strong>{e.publisher}</strong>
                      <span>{e.classification}</span>
                    </div>
                    <p>{e.title}</p>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        Original report <ArrowUpRight size={13} />
                      </a>
                    ) : (
                      <small>Original article URL awaiting verification</small>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">
                  No article references are attached to this record.
                </p>
              )}
              {selected.reviewNotes && <p><strong>Review notes</strong> {selected.reviewNotes}</p>}
              {reviewing && <IncidentReview key={selected.id} record={selected} onApproved={() => {
                refresh();
                showSection(false, selected.id);
              }} />}
            </article>
          )}
        </div>
      </DataGate>
    </div>
  );
}
