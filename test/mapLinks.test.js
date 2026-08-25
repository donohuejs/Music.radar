import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMapUrl,
  buildNativeMapUrl,
  launchMapApp,
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
  const coordinateOnlyVenue = { ...venue, address: null, city: null, state: null, postalCode: null };
  const google = new URL(buildMapUrl("google", coordinateOnlyVenue));
  assert.equal(google.origin, "https://www.google.com");
  assert.equal(google.searchParams.get("destination"), "40.758,-73.989");
  assert.equal(google.searchParams.get("api"), "1");
  assert.equal(google.searchParams.get("dir_action"), null);

  const apple = new URL(buildMapUrl("apple", coordinateOnlyVenue));
  assert.equal(apple.origin, "https://maps.apple.com");
  assert.equal(apple.pathname, "/");
  assert.equal(apple.searchParams.get("daddr"), "40.758,-73.989");
  assert.equal(apple.searchParams.get("dirflg"), "d");

  const waze = new URL(buildMapUrl("waze", coordinateOnlyVenue));
  assert.equal(waze.origin, "https://waze.com");
  assert.equal(waze.searchParams.get("ll"), "40.758,-73.989");
  assert.equal(waze.searchParams.get("navigate"), "yes");
});

test("builds direct app links for every explicit map choice", () => {
  const apple = new URL(buildNativeMapUrl("apple", venue));
  assert.equal(apple.protocol, "http:");
  assert.equal(apple.hostname, "maps.apple.com");
  assert.equal(apple.searchParams.get("daddr"), mapDestination(venue).query);
  assert.equal(apple.searchParams.get("dirflg"), "d");

  const google = new URL(buildNativeMapUrl("google", venue));
  assert.equal(google.protocol, "comgooglemaps:");
  assert.equal(google.searchParams.get("daddr"), mapDestination(venue).query);
  assert.equal(google.searchParams.get("directionsmode"), "driving");

  const waze = new URL(buildNativeMapUrl("waze", venue));
  assert.equal(waze.protocol, "waze:");
  assert.equal(waze.searchParams.get("q"), mapDestination(venue).query);
  assert.equal(waze.searchParams.get("navigate"), "yes");
});

test("falls back to web directions only when an app handoff stays visible", () => {
  const expectedProtocols = {
    apple: "http:",
    google: "comgooglemaps:",
    waze: "waze:",
  };

  for (const app of ["apple", "google", "waze"]) {
    const navigations = [];
    const listeners = new Map();
    const documentObject = {
      visibilityState: "visible",
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    };
    let fallback;

    assert.equal(launchMapApp(app, venue, {
      documentObject,
      navigate: (url) => navigations.push(url),
      schedule: (callback) => { fallback = callback; return 1; },
      cancelSchedule: () => {},
    }), true);
    assert.equal(new URL(navigations[0]).protocol, expectedProtocols[app]);

    fallback();
    assert.equal(new URL(navigations[1]).protocol, "https:");
  }
});

test("cancels the web fallback after any native map app opens", () => {
  for (const app of ["apple", "google", "waze"]) {
    const navigations = [];
    const listeners = new Map();
    let cancelled = false;
    const documentObject = {
      visibilityState: "visible",
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    };

    launchMapApp(app, venue, {
      documentObject,
      navigate: (url) => navigations.push(url),
      schedule: () => 1,
      cancelSchedule: () => { cancelled = true; },
    });
    documentObject.visibilityState = "hidden";
    listeners.get("visibilitychange")();

    assert.equal(cancelled, true);
    assert.equal(navigations.length, 1);
  }
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

test("prefers a specific venue address over approximate source coordinates", () => {
  assert.deepEqual(mapDestination({
    venueName: "Fretwell",
    address: "101 Fretwell Street",
    city: "Spartanburg",
    state: "SC",
    postalCode: "29306",
    latitude: 34.953754,
    longitude: -81.921173,
  }), {
    coordinates: null,
    query: "Fretwell, 101 Fretwell Street, Spartanburg, SC, 29306",
  });
});

test("normalizes supported map preferences", () => {
  assert.equal(normalizeMapApp("apple"), "apple");
  assert.equal(normalizeMapApp("unknown"), null);
  assert.equal(mapAppLabel("waze"), "Waze");
});
