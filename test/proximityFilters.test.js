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
  assert.equal(model.summary, "Walkable · ≤1.5 mi");
  assert.deepEqual(model.availablePresets, PROXIMITY_PRESETS);

  const compact = buildProximityModel({ mode: "short-trip", customMiles: "8" }, 5);
  assert.equal(compact.maxDistance, 5);
  assert.equal(compact.availablePresets.length, 1);
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
    "short-trip": 2,
    "across-town": 3,
  });
});
