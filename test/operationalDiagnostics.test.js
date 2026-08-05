import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationalDiagnostics } from "../lib/server/operationalDiagnostics.js";

test("summarizes actionable operational health without mutating records", () => {
  const now = new Date("2026-08-05T12:00:00Z").getTime();
  const source = {
    id: "broken",
    name: "Broken Calendar",
    enabled: true,
    lastRunAt: "2026-07-20T12:00:00Z",
    lastRunOk: false,
    consecutiveFailures: 3,
    nextIngestAt: "2026-08-05T10:00:00Z",
  };
  const diagnostics = buildOperationalDiagnostics({
    sources: [source, { id: "new", name: "New Source", enabled: true }],
    jobs: [{ id: "cell", status: "failed", updatedAt: "2026-08-05T11:00:00Z" }],
    candidates: [
      { id: "review", status: "validated-candidate", score: 0.97, url: "https://example.com/feed" },
      { id: "registered", status: "registered", score: 0.99 },
    ],
    runs: [{ id: "run", status: "failed", completedAt: "2026-08-05T09:00:00Z" }],
  }, now);

  assert.equal(diagnostics.summary.enabledSources, 2);
  assert.equal(diagnostics.summary.degradedSources, 1);
  assert.equal(diagnostics.summary.staleSources, 2);
  assert.equal(diagnostics.summary.dueSources, 2);
  assert.equal(diagnostics.summary.failedDiscovery, 1);
  assert.equal(diagnostics.summary.reviewCandidates, 1);
  assert.equal(diagnostics.summary.failedRuns, 1);
  assert.equal(diagnostics.sources[0].id, "broken");
  assert.equal(diagnostics.candidates[0].duplicateSourceId, null);
  assert.equal(source.stale, undefined);
});

test("marks review candidates that duplicate a registered source URL", () => {
  const diagnostics = buildOperationalDiagnostics({
    sources: [{ id: "existing", name: "Existing", url: "https://example.com/calendar" }],
    candidates: [{ id: "candidate", status: "discovered", feedUrl: "https://example.com/calendar" }],
  });
  assert.equal(diagnostics.candidates[0].duplicateSourceId, "existing");
});
