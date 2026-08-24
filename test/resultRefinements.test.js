import test from "node:test";
import assert from "node:assert/strict";

import { countActiveRefinements } from "../src/lib/resultRefinements.js";

test("counts only result controls that differ from their defaults", () => {
  assert.equal(countActiveRefinements(), 0);
  assert.equal(countActiveRefinements({
    genre: "Rock",
    proximityMode: "walkable",
    query: "  neighborhood  ",
    sort: "distance",
  }), 4);
});

test("ignores blank result queries", () => {
  assert.equal(countActiveRefinements({ query: "   " }), 0);
});
