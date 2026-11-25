const test = require("node:test");
const assert = require("node:assert/strict");

test("the frontend loads the curated inventory through Vite and FastAPI", async () => {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  });
  const realFetch = global.fetch;
  try {
    await vite.listen();
    const origin = vite.resolvedUrls.local[0];
    const health = await realFetch(new URL("/health", origin));
    assert.deepEqual(await health.json(), { status: "ok" });

    const requests = [];
    global.fetch = (path, options) => {
      const url = new URL(path, origin);
      requests.push(url.pathname);
      return realFetch(url, options);
    };
    const { isDemo, loadDashboard, inspectLocation } = await vite.ssrLoadModule("/src/services/api.ts");
    assert.equal(isDemo, false);
    const payload = await loadDashboard();
    assert.ok(payload.incidents.length > 0);
    assert.ok(payload.incidents.every((record) =>
      ["historical", "new-inventory"].includes(record.kind) && !record.demo));
    const ft185 = [...payload.incidents, ...payload.pendingUpdates]
      .filter((record) => record.id === "lead-ft185-2026-11-21");
    assert.equal(ft185.length, 1);
    assert.equal(ft185[0].reportedAt, "2026-11-21");
    if (ft185[0].kind === "news-lead") {
      assert.equal(ft185[0].coordinates, null);
      assert.ok(payload.pendingUpdates.includes(ft185[0]));
    }
    const knownRecord = payload.incidents.find((record) => record.id === "JMG_original:00001");
    assert.equal(knownRecord.title, "Taman Yulek, Cheras");
    assert.equal(knownRecord.inventory.verifiedUniqueEvent, false);
    assert.equal(knownRecord.reportedAt, null);
    const { occurrenceNewestFirst } = await vite.ssrLoadModule("/src/services/incidentDates.ts");
    const reportWithoutOccurrence = { occurredAt: null, reportedAt: "2026-11-25" };
    const ordered = [...payload.incidents, reportWithoutOccurrence].sort(occurrenceNewestFirst);
    const latestOccurrence = payload.incidents.reduce(
      (latest, record) => record.occurredAt && record.occurredAt > latest ? record.occurredAt : latest,
      "",
    );
    assert.ok(latestOccurrence);
    assert.equal(ordered[0].occurredAt, latestOccurrence);
    assert.equal(ordered.findIndex((record) => record === reportWithoutOccurrence),
      payload.incidents.filter((record) => record.occurredAt).length);
    assert.equal(payload.sources[0].status, "Available");
    assert.equal((await inspectLocation(knownRecord.coordinates)).score, null);
    assert.deepEqual(requests, ["/api/dashboard"]);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loadDashboard(controller.signal), { name: "AbortError" });
  } finally {
    global.fetch = realFetch;
    await vite.close();
  }
});
