import test from "node:test";
import assert from "node:assert/strict";

import { geocodeLocation, reverseGeocodeCoordinates } from "../lib/server/geocode.js";
import geocodeHandler from "../api/geocode.js";

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("forward geocoding supports international cities and labels the country", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => [{
        lat: "48.8566",
        lon: "2.3522",
        display_name: "Paris, France",
        address: { city: "Paris", state: "Île-de-France", country: "France", country_code: "fr" },
      }],
    };
  };
  const result = await geocodeLocation("Paris, France");
  assert.equal(requestedUrl.searchParams.has("countrycodes"), false);
  assert.equal(result.displayName, "Paris, Île-de-France, France");
  assert.equal(result.countryCode, "FR");
});

test("reverse geocoding returns a useful city, state, and postal label", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ address: { city: "Chicago", state: "Illinois", postcode: "60607" } }),
  });
  const result = await reverseGeocodeCoordinates(41.88, -87.65);
  assert.equal(result.displayName, "Chicago, Illinois, 60607");
});

test("reverse geocoding rejects invalid coordinates before fetching", async () => {
  await assert.rejects(() => reverseGeocodeCoordinates(100, -87), /Valid latitude/);
});

test("geocode endpoint resolves a planning timezone and reusable coordinates", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => [{
      lat: "40.7128",
      lon: "-74.0060",
      display_name: "New York, New York, United States",
      address: { city: "New York", state: "New York", country_code: "us" },
    }],
  });
  const response = mockResponse();

  await geocodeHandler({ method: "GET", query: { location: "New York, NY" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.timeZone, "America/New_York");
  assert.equal(response.body.latitude, 40.7128);
  assert.equal(response.body.longitude, -74.006);
});
