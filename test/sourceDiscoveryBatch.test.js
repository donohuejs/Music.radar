import test from "node:test";
import assert from "node:assert/strict";

import { discoverLocationSourceBatch } from "../lib/server/sourceDiscovery.js";

test("discovery batches preserve an organization cursor", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    if (String(url).includes("overpass-api.de")) {
      return {
        ok: true,
        json: async () => ({
          elements: [1, 2, 3].map((id) => ({
            type: "node",
            id,
            lat: 41.8 + id / 100,
            lon: -87.6,
            tags: { name: `Venue ${id}`, website: `https://venue${id}.example/`, amenity: "music_venue" },
          })),
        }),
      };
    }
    if (String(url).endsWith("/sitemap.xml")) {
      return { ok: false, status: 404, headers: new Map(), text: async () => "" };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => "<title>Upcoming Events</title><p>Live music calendar</p>",
    };
  };

  const batch = await discoverLocationSourceBatch(
    { latitude: 41.88, longitude: -87.63, radiusMiles: 10 },
    { organizationOffset: 0, maxOrganizations: 2, deadline: Date.now() + 5000 },
  );
  assert.equal(batch.processedOrganizations, 2);
  assert.equal(batch.nextOffset, 2);
  assert.equal(batch.organizationCount, 3);
  assert.equal(batch.complete, false);
  assert.equal(batch.organizations.length, 3);
});

test("uses Overture seeds when every OpenStreetMap endpoint fails", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    if (String(url).includes("overpass")) throw new Error("service unavailable");
    if (String(url).endsWith("/sitemap.xml")) {
      return { ok: false, status: 404, headers: new Map(), text: async () => "" };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => `
        <title>Independent Arts Calendar</title>
        <a href="/events/first-show">First show</a>
        <a href="/events/second-show">Second show</a>
        <a href="/events/third-show">Third show</a>
      `,
    };
  };

  const batch = await discoverLocationSourceBatch(
    { latitude: 41.88, longitude: -87.63, radiusMiles: 10 },
    {
      maxOrganizations: 2,
      deadline: Date.now() + 5000,
      seedOrganizations: [{
        name: "Independent Arts",
        url: "https://independent-arts.example/events",
        latitude: 41.9,
        longitude: -87.7,
        organizationType: "venue",
        discoveryMethod: "overture-places",
        priority: 5,
      }],
    },
  );

  assert.equal(batch.organizationCount, 1);
  assert.equal(batch.processedOrganizations, 1);
  assert.equal(batch.complete, true);
  assert.match(batch.organizationDiscoveryError, /OpenStreetMap discovery failed/);
  assert.equal(batch.candidates[0].parser, "json-ld-listing");
  assert.equal(batch.candidates[0].discoveryMethod, "overture-places");
});
