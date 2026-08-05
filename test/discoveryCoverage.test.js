import test from "node:test";
import assert from "node:assert/strict";

import {
  discoveryFailureState,
  discoveryCellsForArea,
  discoveryJobId,
  prioritizeDiscoveryJobs,
} from "../lib/server/discoveryStore.js";
import { sourceHealthUpdate } from "../lib/server/sourceRegistry.js";

test("creates unique discovery cells regardless of event volume", () => {
  const cells = discoveryCellsForArea({
    latitude: 40.7128,
    longitude: -74.006,
    radiusMiles: 25,
  });
  assert.ok(cells.length > 1);
  assert.equal(new Set(cells.map((cell) => cell.key)).size, cells.length);
  assert.equal(new Set(cells.map((cell) => discoveryJobId(cell))).size, cells.length);
});

test("larger requested radii retain cells beyond the former first-page cap", () => {
  const cells = discoveryCellsForArea({
    latitude: 51.5072,
    longitude: -0.1276,
    radiusMiles: 100,
  });
  assert.ok(cells.length > 25);
  assert.ok(cells[0].distance <= cells.at(-1).distance);
});

test("prioritizes forced jobs, then oldest work, and recovers expired leases", () => {
  const now = Date.parse("2026-08-05T12:00:00.000Z");
  const jobs = [
    { id: "new", status: "pending", priority: 0, queuedAt: "2026-08-05T11:00:00.000Z" },
    { id: "old", status: "pending", priority: 0, queuedAt: "2026-08-01T11:00:00.000Z" },
    { id: "forced", status: "pending", priority: 1, queuedAt: "2026-08-05T11:30:00.000Z" },
    { id: "expired", status: "running", priority: 0, queuedAt: "2026-08-02T11:00:00.000Z", leaseExpiresAt: "2026-08-05T11:59:00.000Z" },
    { id: "active", status: "running", priority: 0, queuedAt: "2026-07-01T11:00:00.000Z", leaseExpiresAt: "2026-08-05T12:01:00.000Z" },
  ];

  assert.deepEqual(
    prioritizeDiscoveryJobs(jobs, { limit: 10, now }).map((job) => job.id),
    ["forced", "old", "expired", "new"],
  );
});

test("terminal failure depends on consecutive failures, not successful batch count", () => {
  const first = discoveryFailureState({ batchCount: 12, consecutiveFailures: 0 }, 0);
  assert.equal(first.status, "pending");
  assert.equal(first.consecutiveFailures, 1);

  const terminal = discoveryFailureState({ batchCount: 2, consecutiveFailures: 2 }, 0);
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.consecutiveFailures, 3);
});

test("successful source runs promote confidence while repeated failures degrade it", () => {
  const first = sourceHealthUpdate(
    { discoveryConfidence: 0.95, successfulRuns: 2 },
    { ok: true, eventCount: 8 },
  );
  assert.equal(first.lifecycle, "trusted");
  assert.ok(first.sourceConfidence >= 0.98);

  const failed = sourceHealthUpdate(
    {
      discoveryConfidence: 0.95,
      successfulRuns: 3,
      consecutiveFailures: 2,
    },
    { ok: false, eventCount: 0, error: "Calendar unavailable" },
  );
  assert.equal(failed.lifecycle, "degraded");
  assert.equal(failed.consecutiveFailures, 3);
});
