import test from "node:test";
import assert from "node:assert/strict";

import { timeZoneForCoordinates } from "../lib/server/geocode.js";
import { getZonedDateRange } from "../lib/server/zonedDateRange.js";
import { resolveRequestedDateRange } from "../api/search.js";

test("looks up the searched location's IANA time zone", () => {
  assert.equal(timeZoneForCoordinates(40.7128, -74.006), "America/New_York");
  assert.equal(timeZoneForCoordinates(41.8781, -87.6298), "America/Chicago");
  assert.equal(timeZoneForCoordinates(35.6762, 139.6503), "Asia/Tokyo");
});

test("tonight ends at midnight in the searched city, not the browser time zone", () => {
  const now = new Date("2026-08-24T02:05:00.000Z");
  const newYork = getZonedDateRange("tonight", "", "", "America/New_York", now);
  const tokyo = getZonedDateRange("tonight", "", "", "Asia/Tokyo", now);

  assert.equal(newYork.startDate, now.toISOString());
  assert.equal(newYork.endDate, "2026-08-24T03:59:59.999Z");
  assert.equal(tokyo.endDate, "2026-08-24T14:59:59.999Z");
});

test("custom dates honor daylight-saving changes in the searched city", () => {
  const range = getZonedDateRange(
    "custom",
    "2026-03-08",
    "2026-03-08",
    "America/New_York",
  );

  assert.equal(range.startDate, "2026-03-08T05:00:00.000Z");
  assert.equal(range.endDate, "2026-03-09T03:59:59.999Z");
});

test("server date options supersede browser-generated fallback dates", () => {
  const now = new Date("2026-08-24T02:05:00.000Z");
  const range = resolveRequestedDateRange({
    dateOption: "tonight",
    startDate: "2030-01-01T00:00:00.000Z",
    endDate: "2030-01-02T00:00:00.000Z",
  }, "America/New_York", now);

  assert.equal(range.startDate.toISOString(), now.toISOString());
  assert.equal(range.endDate.toISOString(), "2026-08-24T03:59:59.999Z");
});

test("rejects invalid and inverted custom dates", () => {
  assert.throws(
    () => getZonedDateRange("custom", "2026-02-30", "2026-03-01", "America/New_York"),
    /valid custom date range/i,
  );
  assert.throws(
    () => getZonedDateRange("custom", "2026-03-02", "2026-03-01", "America/New_York"),
    /valid custom date range/i,
  );
});
