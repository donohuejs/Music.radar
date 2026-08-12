import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanEventText,
  cleanEventTitle,
  normalizeEvent,
} from "../lib/server/cleanEvent.js";

test("decodes HTML entities, strips markup, and repairs common title mojibake", () => {
  assert.equal(cleanEventText("The Headliner &amp; Guests &ndash; Live"), "The Headliner & Guests \u2013 Live");
  assert.equal(cleanEventText("Artist \u00e2\u20ac\u201c Special Guest"), "Artist \u2013 Special Guest");
  assert.equal(cleanEventText("<strong>Artist</strong> &bull; Guests"), "Artist \u2022 Guests");
});

test("removes a trailing venue suffix after text normalization", () => {
  assert.equal(cleanEventTitle("Artist &ndash; Radio Room", "Radio Room"), "Artist");
  assert.equal(cleanEventTitle("Artist \u00e2\u20ac\u201c Radio Room", "Radio Room"), "Artist");
});

test("normalizes both display title and artist name for stable deduplication", () => {
  const event = normalizeEvent({
    name: "<b>Artist</b> &ndash; Radio Room",
    artistName: "Artist \u00e2\u20ac\u201c Radio Room",
    venueName: "Radio Room",
    startTime: "2026-09-16T20:00:00-04:00",
    category: "music",
  });
  assert.equal(event.name, "Artist");
  assert.equal(event.artistName, "Artist");
});
