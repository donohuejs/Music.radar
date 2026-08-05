import test from "node:test";
import assert from "node:assert/strict";

import { buildPublishedPosterEvent, validTimeZone } from "../lib/server/posterPublication.js";

const candidate = { id: "poster", name: "Town Square", url: "https://example.com/events", latitude: 41.9, longitude: -87.6 };
const draft = { id: "draft", status: "needs-review" };

test("builds a reviewed poster event with timezone-correct UTC time", () => {
  const event = buildPublishedPosterEvent(candidate, draft, {
    name: "The Example Band",
    localDate: "2026-09-16",
    localTime: "19:30",
    timeZone: "America/Chicago",
    venueName: "Town Square",
    category: "music",
  }, Date.parse("2026-08-05T00:00:00Z"));
  assert.equal(event.startTime, "2026-09-17T00:30:00.000Z");
  assert.equal(event.confidence, 0.9);
  assert.equal(event.posterDraftId, "draft");
});

test("rejects incomplete, invalid, and already reviewed poster drafts", () => {
  assert.equal(validTimeZone("Not/AZone"), false);
  assert.throws(() => buildPublishedPosterEvent(candidate, draft, {
    name: "Example", localDate: "2026-09-16", localTime: "19:30", timeZone: "Not/AZone",
  }), /time zone/);
  assert.throws(() => buildPublishedPosterEvent(candidate, { ...draft, status: "published" }, {
    name: "Example", localDate: "2026-09-16", localTime: "19:30", timeZone: "America/Chicago",
  }), /already published/);
});
