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
