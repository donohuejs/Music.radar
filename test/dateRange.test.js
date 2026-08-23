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

test("builds next 14 and next 30 day ranges", () => {
  for (const [option, days] of [["fortnight", 14], ["month", 30]]) {
    const range = getDateRange(option);
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    assert.equal(Math.round((end - start) / 86_400_000), days + 1);
    assert.equal(start.getHours(), 0);
    assert.equal(end.getHours(), 23);
  }
});

test("starts tonight at the current time instead of midnight", () => {
  const now = new Date(2026, 7, 23, 14, 5, 30, 250);
  const range = getDateRange("tonight", "", "", now);

  assert.equal(range.startDate, now.toISOString());
  const end = new Date(range.endDate);
  assert.equal(end.getFullYear(), now.getFullYear());
  assert.equal(end.getMonth(), now.getMonth());
  assert.equal(end.getDate(), now.getDate());
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
});
