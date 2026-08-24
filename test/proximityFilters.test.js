import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProximityModel,
  countEventsByProximity,
  PROXIMITY_PRESETS,
} from "../src/lib/proximityFilters.js";

test("builds available presets and a compact selected-distance summary", () => {
  const model = buildProximityModel({ mode: "walkable", customMiles: "3" }, 25);
  assert.equal(model.maxDistance, 1.5);
  assert.equal(model.minDistance, null);
  assert.equal(model.summary, "Walkable · ≤1.5 mi");
  assert.deepEqual(
    model.availablePresets.map((preset) => preset.value),
    ["walkable", "short-trip", "across-town", "farther-out"],
  );

  const compact = buildProximityModel({ mode: "short-trip", customMiles: "8" }, 5);
  assert.equal(compact.maxDistance, 5);
  assert.equal(compact.minDistance, 1.5);
  assert.equal(compact.summary, "Short trip · 1.5–5 mi");
  assert.deepEqual(
    compact.availablePresets.map((preset) => preset.value),
    ["walkable", "short-trip"],
  );

  const acrossTown = buildProximityModel({ mode: "across-town", customMiles: "8" }, 25);
  assert.equal(acrossTown.minDistance, 5);
  assert.equal(acrossTown.maxDistance, 10);
  assert.equal(acrossTown.summary, "Across town · 5–10 mi");

  const fartherOut = buildProximityModel({ mode: "farther-out", customMiles: "8" }, 25);
  assert.equal(fartherOut.minDistance, 10);
  assert.equal(fartherOut.maxDistance, 25);
  assert.equal(fartherOut.summary, "Farther out · 10–25 mi");
});

test("clamps a custom distance to the completed search radius", () => {
  const model = buildProximityModel({ mode: "custom", customMiles: "40" }, 25);
  assert.equal(model.customDistance, 25);
  assert.equal(model.maxDistance, 25);
  assert.equal(model.summary, "Custom · ≤25 mi");
});

test("counts proximity options in one pass and ignores unknown distances", () => {
  const counts = countEventsByProximity([
    { distanceMiles: 0.7 },
    { distanceMiles: 2.4 },
    { distanceMiles: 8.2 },
    { distanceMiles: 18.5 },
    {},
  ], PROXIMITY_PRESETS, 3);

  assert.equal(counts.all, 5);
  assert.equal(counts.custom, 2);
  assert.deepEqual(counts.presets, {
    walkable: 1,
    "short-trip": 1,
    "across-town": 1,
    "farther-out": 1,
  });
});
