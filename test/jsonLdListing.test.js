import test from "node:test";
import assert from "node:assert/strict";

import { fetchVenueEvents } from "../lib/server/jsonLdEvents.js";

test("collects JSON-LD events from linked detail pages", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  const pages = new Map([
    ["https://venue.example/shows", `
      <a href="/event/first-show">First</a>
      <a href="/event/second-show">Second</a>
      <a href="/event/first-show">Duplicate</a>
    `],
    ["https://venue.example/event/first-show", `
      <script type="application/ld+json">{"@type":"Event","name":"First Artist","startDate":"2026-09-16T20:00:00-05:00","location":{"name":"Example Hall"}}</script>
    `],
    ["https://venue.example/event/second-show", `
      <script type="application/ld+json">{"@type":"Event","name":"Second Artist","startDate":"2026-09-17T20:00:00-05:00","location":{"name":"Example Hall"}}</script>
    `],
  ]);
  global.fetch = async (url) => ({
    ok: pages.has(String(url)),
    status: pages.has(String(url)) ? 200 : 404,
    text: async () => pages.get(String(url)) || "",
  });
  const events = await fetchVenueEvents({
    id: "example-hall",
    name: "Example Hall",
    url: "https://venue.example/shows",
    parser: "json-ld-listing",
    latitude: 41.9,
    longitude: -87.65,
  });
  assert.deepEqual(events.map((event) => event.name).sort(), ["First Artist", "Second Artist"]);
  assert.equal(events[0].venueName, "Example Hall");
});
