import test from "node:test";
import assert from "node:assert/strict";

import {
  confidenceExplanation,
  filterAndSortEvents,
  filterUpcomingEvents,
  groupTheaterRuns,
  scanButtonLabel,
} from "../src/lib/eventDisplay.js";

test("filters dense results by venue text and sorts them by distance", () => {
  const events = [
    { id: "far", name: "Alpha", venueName: "Arena", startTime: "2026-09-01T19:00:00Z", distanceMiles: 8, genres: ["Rock"] },
    { id: "near", name: "Beta", venueName: "Neighborhood Club", startTime: "2026-09-02T19:00:00Z", distanceMiles: 1, genres: ["Jazz"] },
    { id: "mid", name: "Gamma", venueName: "Neighborhood Hall", startTime: "2026-09-03T19:00:00Z", distanceMiles: 4, genres: ["Rock"] },
  ];
  assert.deepEqual(
    filterAndSortEvents(events, { query: "neighborhood", sort: "distance" }).map((event) => event.id),
    ["near", "mid"],
  );
  assert.deepEqual(filterAndSortEvents(events, { genre: "Rock" }).map((event) => event.id), ["far", "mid"]);
  assert.deepEqual(
    filterAndSortEvents(events, { maxDistance: 4 }).map((event) => event.id),
    ["near", "mid"],
  );
  assert.deepEqual(
    filterAndSortEvents(events, { minDistance: 5, maxDistance: 10 }).map((event) => event.id),
    ["far"],
  );
});

test("filters and sorts results by estimated travel time", () => {
  const events = [
    { id: "slow", startTime: "2026-09-01T19:00:00Z", travelMinutes: 42 },
    { id: "quick", startTime: "2026-09-02T19:00:00Z", travelMinutes: 11 },
    { id: "unknown", startTime: "2026-09-03T19:00:00Z" },
    { id: "medium", startTime: "2026-09-04T19:00:00Z", travelMinutes: 28 },
  ];

  assert.deepEqual(
    filterAndSortEvents(events, { maxTravelMinutes: 35, sort: "travel" })
      .map((event) => event.id),
    ["quick", "medium"],
  );
});

test("removes events once their start time has passed", () => {
  const events = [
    { id: "past", startTime: "2026-08-23T12:00:00-04:00" },
    { id: "now", startTime: "2026-08-23T14:05:00-04:00" },
    { id: "later", startTime: "2026-08-23T20:00:00-04:00" },
  ];

  assert.deepEqual(
    filterUpcomingEvents(events, "2026-08-23T14:05:00-04:00").map((event) => event.id),
    ["now", "later"],
  );
});

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
