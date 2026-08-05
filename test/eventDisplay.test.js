import test from "node:test";
import assert from "node:assert/strict";

import {
  confidenceExplanation,
  groupTheaterRuns,
  scanButtonLabel,
} from "../src/lib/eventDisplay.js";

test("uses the selected category in the scan button", () => {
  assert.equal(scanButtonLabel("music"), "Scan for live music");
  assert.equal(scanButtonLabel("theater"), "Scan for theater");
  assert.equal(scanButtonLabel("comedy"), "Scan for comedy");
  assert.equal(scanButtonLabel("trivia"), "Scan for trivia");
});

test("explains event confidence using available evidence", () => {
  const explanation = confidenceExplanation({
    confidence: 0.98,
    sourceName: "Ticketmaster",
    startTime: "2026-09-19T01:00:00Z",
    venueName: "Example Hall",
    ticketUrl: "https://example.com/event",
    externalIds: ["one", "two"],
  });

  assert.match(explanation, /98%/);
  assert.match(explanation, /Ticketmaster/);
  assert.match(explanation, /2 matching provider records/);
  assert.match(explanation, /not a rating/i);
});

test("groups consecutive theater performances into a single production run", () => {
  const events = [
    { id: "one", name: "Hamilton", venueName: "Example Theatre", city: "Chicago", state: "IL", category: "theater", startTime: "2026-09-01T19:00:00Z" },
    { id: "two", name: "Hamilton", venueName: "Example Theatre", city: "Chicago", state: "IL", category: "theater", startTime: "2026-09-08T19:00:00Z" },
    { id: "music", name: "Hamilton Tribute Band", venueName: "Example Theatre", category: "music", startTime: "2026-09-09T19:00:00Z" },
  ];

  const grouped = groupTheaterRuns(events);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].name, "Hamilton");
  assert.equal(grouped[0].performanceCount, 2);
  assert.equal(grouped[0].runEndTime, "2026-09-08T19:00:00Z");
  assert.equal(grouped[1].id, "music");
});

test("does not merge separate theater engagements with a long gap", () => {
  const events = [
    { id: "spring", name: "Hamlet", venueName: "Example Theatre", category: "theater", startTime: "2026-04-01T19:00:00Z" },
    { id: "fall", name: "Hamlet", venueName: "Example Theatre", category: "theater", startTime: "2026-09-01T19:00:00Z" },
  ];

  assert.deepEqual(groupTheaterRuns(events), events);
});
