import test from "node:test";
import assert from "node:assert/strict";

import {
  attachTravelEstimates,
  clampTravelMinutes,
  countTravelMatches,
  mapTravelEstimates,
  travelModeLabel,
} from "../src/lib/travelTimeFilters.js";

test("normalizes travel-time settings and estimates", () => {
  assert.equal(travelModeLabel("transit"), "Transit");
  assert.equal(clampTravelMinutes(4), 10);
  assert.equal(clampTravelMinutes(90), 60);
  assert.deepEqual(mapTravelEstimates([
    { id: "one", minutes: 11, distanceMiles: 2.4 },
    { id: "invalid", minutes: null },
  ]), { one: { minutes: 11, distanceMiles: 2.4 } });
});

test("attaches estimates and counts events within the selected time", () => {
  const events = [{ id: "one" }, { id: "two" }, { id: "three" }];
  const attached = attachTravelEstimates(events, {
    one: { minutes: 9 },
    two: { minutes: 31 },
  }, "transit");

  assert.deepEqual(attached[0], { id: "one", travelMinutes: 9, travelMode: "transit" });
  assert.equal(countTravelMatches(attached, 30), 1);
});
