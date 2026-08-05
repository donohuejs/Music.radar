import test from "node:test";
import assert from "node:assert/strict";
import { buildEventSuppression, canonicalSuppressionUrl, filterSuppressedEvents } from "../lib/server/eventSuppressions.js";

test("canonicalizes event URLs and ignores tracking parameters", () => {
  assert.equal(canonicalSuppressionUrl("https://Venue.Example/events/show/?utm_source=email#tickets"), "https://venue.example/events/show");
});

test("filters exact event URLs without hiding unrelated venue events", () => {
  const suppression = buildEventSuppression({ url: "https://venue.example/events/tap-takeover", reason: "wrong-category" });
  const events = [
    { name: "Tap Takeover", sourceUrl: "https://venue.example/events/tap-takeover/" },
    { name: "Concert", sourceUrl: "https://venue.example/events/concert" },
  ];
  assert.deepEqual(filterSuppressedEvents(events, [suppression]).map((event) => event.name), ["Concert"]);
});
