import test from "node:test";
import assert from "node:assert/strict";

import { parseSeriesSchedule } from "../lib/server/seriesSchedules.js";

test("turns a structured poster lineup into timezone-correct events", () => {
  const events = parseSeriesSchedule({
    id: "city-series",
    name: "City Series",
    url: "https://example.gov/concerts",
    venueName: "Town Square",
    latitude: 34.8,
    longitude: -82.4,
    timeZone: "America/New_York",
    startTime: "17:30",
    endTime: "20:30",
    schedule: [
      { date: "2026-08-06", name: "The Example Band" },
      { date: "2026-08-13", name: "No Concert" },
    ],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].name, "The Example Band");
  assert.equal(events[0].startTime, "2026-08-06T21:30:00.000Z");
  assert.equal(events[0].endTime, "2026-08-07T00:30:00.000Z");
});
