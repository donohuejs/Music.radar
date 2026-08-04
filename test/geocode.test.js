import test from "node:test";
import assert from "node:assert/strict";

import { reverseGeocodeCoordinates } from "../lib/server/geocode.js";

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
