import test from "node:test";
import assert from "node:assert/strict";

import {
  detectPageSource,
  overpassQuery,
  parseOverpassCandidates,
} from "../lib/server/sourceDiscovery.js";

test("builds a bounded Overpass query for likely music organizations", () => {
  const query = overpassQuery({ latitude: 34.85, longitude: -82.4, radiusMiles: 25 });
  assert.match(query, /around:40234,34\.85,-82\.4/);
  assert.match(query, /craft"="brewery/);
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
