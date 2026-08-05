import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchCoverageRecord } from "../lib/server/searchCoverage.js";

test("flags a Ticketmaster-only search as a coverage blind spot", () => {
  const record = buildSearchCoverageRecord({
    displayName: "Chicago, IL",
    radiusMiles: 10,
    category: "music",
    startDate: "2026-09-01T00:00:00Z",
    endDate: "2026-09-30T00:00:00Z",
    events: [{ sourceName: "Ticketmaster" }],
    discoveryCoverage: { cells: [{ id: "one", status: "complete", registeredSourceCount: 0 }] },
    now: Date.parse("2026-08-05T12:00:00Z"),
  });
  assert.equal(record.coverageState, "commercial-only");
  assert.equal(record.blindSpot, true);
  assert.equal(record.weakDiscoveryCellCount, 1);
  assert.deepEqual(record.sourceContributors, ["Ticketmaster"]);
});

test("recognizes local source contribution after cross-source merging", () => {
  const record = buildSearchCoverageRecord({
    displayName: "Chicago, IL",
    radiusMiles: 10,
    category: "music",
    startDate: "2026-09-01T00:00:00Z",
    endDate: "2026-09-30T00:00:00Z",
    events: [{ sourceName: "Ticketmaster + Metro Chicago" }],
    discoveryCoverage: { cells: [{ id: "one", status: "complete", registeredSourceCount: 1 }] },
  });
  assert.equal(record.coverageState, "local-supported");
  assert.equal(record.blindSpot, false);
  assert.equal(record.localContributorCount, 1);
});
