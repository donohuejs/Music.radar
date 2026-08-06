import test from "node:test";
import assert from "node:assert/strict";
import { buildLocationIndex, suggestLocations } from "../src/lib/locationSuggestions.js";

const index = buildLocationIndex({
  cities: [["Chicago", "IL", 2700000], ["Chico", "CA", 101000], ["Greenville", "SC", 72000]],
  zips: [["60647", "Chicago", "IL"], ["29601", "Greenville", "SC"]],
});

test("suggests cities, states, and ZIP codes locally", () => {
  assert.equal(suggestLocations(index, "chic")[0].value, "Chicago, IL");
  assert.equal(suggestLocations(index, "illi")[0].value, "Illinois");
  assert.equal(suggestLocations(index, "606")[0].value, "60647");
});

test("tolerates a small city-name typo without changing exact prefix priority", () => {
  assert.equal(suggestLocations(index, "chicgo")[0].value, "Chicago, IL");
  assert.equal(suggestLocations(index, "chico")[0].value, "Chico, CA");
});
