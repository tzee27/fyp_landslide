import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useData } from "../app/DataProvider";
import { PageHeader, DemoNote, DataGate } from "../components/Common";
import { kindLabels } from "../mocks/data";
import TerrainMap from "../components/TerrainMap";
export default function Incidents() {
  const { data, refresh, loading } = useData();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState("All states"),
    [kind, setKind] = useState("All record types"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const all = data?.incidents ?? [];
  const filtered = all.filter(
    (i) =>
      (state === "All states" || i.state === state) &&
      (kind === "All record types" || i.kind === kind) &&
      (!from || i.reportedAt >= from) &&
      (!to || i.reportedAt <= to) &&
      (
        i.title +
        " " +
        i.district +
        " " +
        i.evidence.map((e) => e.publisher).join(" ")
      )
        .toLowerCase()
        .includes(search.toLowerCase()),
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
      <DemoNote>
        Demonstration notebook. The collector is not connected; sample records
        are not confirmed new landslides.
      </DemoNote>
      <div className="collector-strip">
        <span>
          Collector <b>Not configured</b>
        </span>
        <span>
          Last run <b>Not available</b>
        </span>
        <span>
          Duplicate screening <b>Awaiting backend</b>
        </span>
        <span>
          Demo records <b>{all.length}</b>
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
            {Object.entries(kindLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reported from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Reported to
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
              <span className="eyebrow">REPORT NOTEBOOK</span>
              <span>{filtered.length} records</span>
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
                  onClick={() => setParams({ id: i.id })}
                  key={i.id}
                >
                  <div className="incident-item-meta">
                    <span className={"record-symbol " + i.kind} />
                    <span>{kindLabels[i.kind]}</span>
                    <time>{i.reportedAt}</time>
                  </div>
                  <h3>{i.title}</h3>
                  <p>
                    {i.district}, {i.state}
                  </p>
                  <small>
                    {i.evidence.length} evidence references{" "}
                    <span>Demo record</span>
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
                <span className="tag sand">Demonstration</span>
              </div>
              <p>{selected.description}</p>
              <TerrainMap
                key={selected.id}
                compact
                incidents={[selected]}
                showZones={false}
                place={{
                  center: selected.locator,
                  zoom: selected.coordinates ? 9 : 8,
                }}
              />
              <p className="microcopy">
                {selected.coordinates
                  ? "Solid marker: synthetic point fixture."
                  : "Hollow circle: approximate locality locator, not an event coordinate or an administrative boundary."}
              </p>
              <dl className="details-list">
                <div>
                  <dt>Reported date</dt>
                  <dd>{selected.reportedAt}</dd>
                </div>
                <div>
                  <dt>Verified occurrence date</dt>
                  <dd>
                    {selected.occurredAt
                      ? selected.occurredAt + " · synthetic"
                      : "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Location precision</dt>
                  <dd>{selected.precision}</dd>
                </div>
                <div>
                  <dt>Event coordinates</dt>
                  <dd>
                    {selected.coordinates
                      ? selected.coordinates.join(", ") + " · synthetic"
                      : "Not verified"}
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
                  <dt>ML training eligibility</dt>
                  <dd>Excluded · demonstration data</dd>
                </div>
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
                  No evidence attached to this synthetic fixture.
                </p>
              )}
            </article>
          )}
        </div>
      </DataGate>
    </div>
  );
}
