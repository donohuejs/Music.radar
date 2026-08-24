import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchContext } from "../src/lib/searchContext.js";

test("summarizes the server-confirmed search location, window, radius, and timezone", () => {
  const context = buildSearchContext({
    resolvedLocation: {
      displayName: "New York, New York",
      timeZone: "America/New_York",
    },
    radiusMiles: 25,
    dateOption: "tonight",
    searchStartDate: "2026-08-24T00:05:00.000Z",
  });

  assert.deepEqual(context.slice(0, 3), [
    "New York, New York",
    "Tonight",
    "Within 25 mi",
  ]);
  assert.match(context[3], /^Times in /);
});

test("shows the exact server-confirmed custom dates", () => {
  const context = buildSearchContext({
    resolvedLocation: { displayName: "Chicago, Illinois", timeZone: "America/Chicago" },
    radiusMiles: 10,
    dateOption: "custom",
    customStartDate: "2026-09-04",
    customEndDate: "2026-09-06",
    searchStartDate: "2026-09-04T05:00:00.000Z",
  });

  assert.equal(context[1], "Sep 4, 2026 – Sep 6, 2026");
});

test("does not invent context before a successful search", () => {
  assert.deepEqual(buildSearchContext(null), []);
});
