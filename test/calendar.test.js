import test from "node:test";
import assert from "node:assert/strict";

import {
  calendarDays,
  parseLocalDate,
  toLocalDateValue,
} from "../src/lib/calendar.js";

test("builds a six-week clickable calendar grid", () => {
  const days = calendarDays(new Date(2026, 7, 1));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 0);
  assert.equal(days[41].getDay(), 6);
  assert.equal(days.some((date) => toLocalDateValue(date) === "2026-08-31"), true);
});

test("parses calendar values without UTC date shifting", () => {
  const date = parseLocalDate("2026-08-07");
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 7);
  assert.equal(date.getDate(), 7);
  assert.equal(parseLocalDate("08/07/2026"), null);
});
