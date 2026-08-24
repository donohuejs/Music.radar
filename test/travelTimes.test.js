import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchGoogleTravelTimes,
  normalizeTravelPoint,
  parseRouteDuration,
} from "../lib/server/travelTimes.js";

test("normalizes valid route points and rejects invalid coordinates", () => {
  assert.deepEqual(normalizeTravelPoint({ id: "venue", latitude: "40.7", longitude: -74 }, { requireId: true }), {
    id: "venue",
    latitude: 40.7,
    longitude: -74,
  });
  assert.equal(normalizeTravelPoint({ latitude: 100, longitude: -74 }), null);
  assert.equal(normalizeTravelPoint({ latitude: 40, longitude: -74 }, { requireId: true }), null);
});

test("parses protobuf route durations", () => {
  assert.equal(parseRouteDuration("160s"), 160);
  assert.equal(parseRouteDuration("3.5s"), 3.5);
  assert.equal(parseRouteDuration("soon"), null);
});

test("builds a route matrix request and maps estimates back to event ids", async () => {
  let request;
  const result = await fetchGoogleTravelTimes({
    apiKey: "test-key",
    origin: { latitude: 40.7128, longitude: -74.006 },
    destinations: [
      { id: "first", latitude: 40.72, longitude: -73.99 },
      { id: "second", latitude: 40.74, longitude: -73.96 },
    ],
    mode: "transit",
    departureTime: new Date("2026-08-24T22:00:00.000Z"),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => [
          { destinationIndex: 1, duration: "1801s", distanceMeters: 6437, status: {}, condition: "ROUTE_EXISTS" },
          { destinationIndex: 0, duration: "540s", distanceMeters: 1200, status: {}, condition: "ROUTE_EXISTS" },
        ],
      };
    },
  });

  assert.match(request.url, /computeRouteMatrix$/);
  assert.equal(request.options.headers["X-Goog-Api-Key"], "test-key");
  assert.equal(JSON.parse(request.options.body).travelMode, "TRANSIT");
  assert.deepEqual(result.estimates.map(({ id, minutes }) => ({ id, minutes })), [
    { id: "second", minutes: 31 },
    { id: "first", minutes: 9 },
  ]);
});

test("ignores route elements without a usable route", async () => {
  const result = await fetchGoogleTravelTimes({
    apiKey: "test-key",
    origin: { latitude: 40.7, longitude: -74 },
    destinations: [{ id: "missing", latitude: 40.8, longitude: -74 }],
    mode: "walk",
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ destinationIndex: 0, status: {}, condition: "ROUTE_NOT_FOUND" }],
    }),
  });
  assert.deepEqual(result.estimates, []);
});
