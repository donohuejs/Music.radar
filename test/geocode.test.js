import test from "node:test";
import assert from "node:assert/strict";

import { geocodeLocation, reverseGeocodeCoordinates } from "../lib/server/geocode.js";

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
