import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMapUrl,
  mapAppLabel,
  mapDestination,
  normalizeMapApp,
} from "../src/lib/mapLinks.js";

const venue = {
  venueName: "Birdland Jazz Club",
  address: "315 W 44th St",
  city: "New York",
  state: "NY",
  postalCode: "10036",
  latitude: 40.758,
  longitude: -73.989,
};

test("builds free universal directions links from venue coordinates", () => {
  const google = new URL(buildMapUrl("google", venue));
  assert.equal(google.origin, "https://www.google.com");
  assert.equal(google.searchParams.get("destination"), "40.758,-73.989");
  assert.equal(google.searchParams.get("api"), "1");

  const apple = new URL(buildMapUrl("apple", venue));
  assert.equal(apple.origin, "https://maps.apple.com");
  assert.equal(apple.searchParams.get("destination"), "40.758,-73.989");

  const waze = new URL(buildMapUrl("waze", venue));
  assert.equal(waze.origin, "https://www.waze.com");
  assert.equal(waze.searchParams.get("ll"), "40.758,-73.989");
  assert.equal(waze.searchParams.get("navigate"), "yes");
});

test("falls back to a venue address and rejects events without a destination", () => {
  const addressOnly = { ...venue, latitude: null, longitude: null };
  assert.equal(
    mapDestination(addressOnly).query,
    "Birdland Jazz Club, 315 W 44th St, New York, NY, 10036",
  );
  assert.equal(new URL(buildMapUrl("waze", addressOnly)).searchParams.get("q"), mapDestination(addressOnly).query);
  assert.equal(buildMapUrl("google", {}), null);
});

test("normalizes supported map preferences", () => {
  assert.equal(normalizeMapApp("apple"), "apple");
  assert.equal(normalizeMapApp("unknown"), null);
  assert.equal(mapAppLabel("waze"), "Waze");
});
