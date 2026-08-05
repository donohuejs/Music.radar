import test from "node:test";
import assert from "node:assert/strict";

import { confidenceExplanation, scanButtonLabel } from "../src/lib/eventDisplay.js";

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
