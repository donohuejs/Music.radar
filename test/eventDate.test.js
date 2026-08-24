import test from "node:test";
import assert from "node:assert/strict";

import { formatEventDate, formatTheaterRun } from "../src/lib/eventDate.js";

test("formats event times in the searched location's time zone", () => {
  const eventTime = "2026-08-24T02:00:00.000Z";

  assert.match(formatEventDate(eventTime, "America/New_York"), /Sun, Aug 23, 10:00 PM EDT/);
  assert.match(formatEventDate(eventTime, "America/Los_Angeles"), /Sun, Aug 23, 7:00 PM PDT/);
});

test("formats theater run dates in the searched location's time zone", () => {
  const result = formatTheaterRun(
    "2026-08-24T02:00:00.000Z",
    "2026-08-25T02:00:00.000Z",
    "America/New_York",
  );

  assert.equal(result, "Aug 23, 2026 – Aug 24, 2026");
});
