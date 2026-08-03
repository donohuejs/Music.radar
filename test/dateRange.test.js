import test from "node:test";
import assert from "node:assert/strict";

import { getDateRange } from "../src/lib/dateRange.js";

test("builds an inclusive custom local date range", () => {
  const range = getDateRange("custom", "2026-08-06", "2026-08-09");
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 7);
  assert.equal(start.getDate(), 6);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getDate(), 9);
  assert.equal(end.getHours(), 23);
});

test("rejects an inverted custom date range", () => {
  assert.throws(
    () => getDateRange("custom", "2026-08-10", "2026-08-09"),
    /valid custom date range/i,
  );
});

test("builds a full-day range from a clicked calendar date", () => {
  const range = getDateRange("date", null, null, "2026-08-07");
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  assert.equal(start.getDate(), 7);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getDate(), 7);
  assert.equal(end.getHours(), 23);
});
