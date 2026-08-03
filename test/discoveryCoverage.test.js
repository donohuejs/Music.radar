import test from "node:test";
import assert from "node:assert/strict";

import {
  discoveryCellsForArea,
  discoveryJobId,
} from "../lib/server/discoveryStore.js";
import { sourceHealthUpdate } from "../lib/server/sourceRegistry.js";

test("creates bounded discovery cells regardless of event volume", () => {
  const cells = discoveryCellsForArea({
    latitude: 40.7128,
    longitude: -74.006,
    radiusMiles: 25,
  });
  assert.ok(cells.length > 1);
  assert.ok(cells.length <= 25);
  assert.equal(new Set(cells.map((cell) => cell.key)).size, cells.length);
  assert.equal(new Set(cells.map((cell) => discoveryJobId(cell))).size, cells.length);
});

test("larger requested radii remain capped to a safe worker batch", () => {
  const cells = discoveryCellsForArea({
    latitude: 51.5072,
    longitude: -0.1276,
    radiusMiles: 100,
  });
  assert.equal(cells.length, 25);
  assert.ok(cells[0].distance <= cells.at(-1).distance);
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
