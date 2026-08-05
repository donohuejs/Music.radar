import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  detectPageSource,
  eventDetailLinks,
  overpassQuery,
  parseOverpassCandidates,
} from "../lib/server/sourceDiscovery.js";

test("builds a bounded Overpass query for likely music organizations", () => {
  const query = overpassQuery({ latitude: 34.85, longitude: -82.4, radiusMiles: 25 });
  assert.match(query, /around:40234,34\.85,-82\.4/);
  assert.match(query, /craft"="brewery/);
  assert.match(query, /contact:website/);
  assert.match(query, /music_venue/);
  assert.match(query, /events_venue/);
  assert.match(query, /boundary"="administrative/);
});

test("normalizes public OSM websites and rejects private network targets", () => {
  const candidates = parseOverpassCandidates({
    elements: [
      {
        type: "node",
        id: 1,
        lat: 34.85,
        lon: -82.4,
        tags: { name: "Example Brewery", website: "https://brew.example/events", craft: "brewery" },
      },
      {
        type: "node",
        id: 2,
        lat: 34.85,
        lon: -82.4,
        tags: { name: "Private", website: "http://127.0.0.1/events" },
      },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "Example Brewery");
  assert.equal(candidates[0].organizationType, "venue");
});

test("detects embedded calendars, JSON-LD events, feeds, and posters", () => {
  assert.equal(
    detectPageSource(
      '<div data-tockify-calendar="city.music"></div>',
      "https://city.example/events",
    ).parser,
    "calendar-page",
  );
  assert.equal(
    detectPageSource(
      '<script type="application/ld+json">{"@type":"Event"}</script>',
      "https://venue.example/shows",
    ).parser,
    "json-ld",
  );
  const detail = detectPageSource(
    '<script type="application/ld+json">{"@type":"Event"}</script>',
    "https://venue.example/events/one-show",
  );
  assert.equal(detail.sourceScope, "single-event");
  assert.equal(detail.reusableSource, false);
  assert.equal(
    detectPageSource(
      '<a href="/music.ics">Calendar</a>',
      "https://venue.example/shows",
    ).parser,
    "ical",
  );
  assert.equal(
    detectPageSource(
      '<a href="/summer-lineup.pdf">Entertainment lineup</a>',
      "https://city.example/events",
    ).kind,
    "poster",
  );
  assert.equal(
    detectPageSource(
      String.raw`{\"content\":\"\u003ca href=\"https:\/\/content.civicplus.com\/api\/assets\/abc\"\u003e\u003cimg alt=\"2026 Entertainment Lineup\"\u003e\u003c\/a\u003e\"}`,
      "https://city.example/events",
    ).kind,
    "poster",
  );
});

test("detects a reusable linked-event listing without treating it as a poster", () => {
  const html = readFileSync(
    new URL("./fixtures/garcias-listing.html", import.meta.url),
    "utf8",
  );
  const detection = detectPageSource(html, "https://venue.example/shows");
  assert.equal(detection.kind, "calendar");
  assert.equal(detection.parser, "json-ld-listing");
  assert.equal(detection.linkedEventCount, 3);
  assert.equal(eventDetailLinks(html, "https://venue.example/shows").length, 3);
});

test("recognizes Metro-style WordPress event detail links", () => {
  const html = readFileSync(
    new URL("./fixtures/metro-listing.html", import.meta.url),
    "utf8",
  );
  const detection = detectPageSource(html, "https://metro.example/events/");
  assert.equal(detection.parser, "json-ld-listing");
  assert.equal(detection.linkedEventCount, 3);
});

test("does not classify a normal shows link as a poster asset", () => {
  assert.equal(
    detectPageSource('<a href="/shows">Music lineup and shows</a>', "https://venue.example/"),
    null,
  );
});

test("does not mistake a detail page with related shows for a listing", () => {
  const html = `
    <a href="/garcias-events/related-one">One</a>
    <a href="/garcias-events/related-two">Two</a>
    <a href="/garcias-events/related-three">Three</a>
  `;
  assert.equal(
    detectPageSource(html, "https://venue.example/garcias-events/headliner"),
    null,
  );
});
