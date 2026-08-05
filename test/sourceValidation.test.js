import test from "node:test";
import assert from "node:assert/strict";

import { validateSource } from "../lib/server/sourceValidation.js";

test("accepts a reviewed source only when it uses a reusable parser", () => {
  const source = validateSource({
    name: "Example Calendar",
    url: "https://example.com/events.ics",
    parser: "ical",
    latitude: 41.9,
    longitude: -87.6,
  });
  assert.equal(source.id, "example-calendar");
  assert.equal(source.category, null);
  assert.equal(source.enabled, true);
  assert.throws(
    () => validateSource({ ...source, parser: "custom-one-off" }),
    /Unsupported source parser/,
  );
});
