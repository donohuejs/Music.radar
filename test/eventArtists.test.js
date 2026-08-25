import test from "node:test";
import assert from "node:assert/strict";

import {
  artistLookupKey,
  extractEventArtistNames,
} from "../lib/server/eventArtists.js";

test("extracts performers from common calendar marketing titles", () => {
  assert.deepEqual(
    extractEventArtistNames({ category: "music", name: "Sam Godfrey Band - Free Live Music" }),
    ["Sam Godfrey Band"],
  );
  assert.deepEqual(
    extractEventArtistNames({ category: "music", name: "Charles Hedgepath’s Tuesday Night Music Series" }),
    ["Charles Hedgepath"],
  );
  assert.deepEqual(
    extractEventArtistNames({ category: "music", name: "Happy Hour is DEAD (Chris Duvall & Charles Hedgepath)" }),
    ["Chris Duvall", "Charles Hedgepath"],
  );
});

test("separates explicitly billed guests and rejects generic placeholders", () => {
  assert.deepEqual(
    extractEventArtistNames({ category: "music", name: "Hotel Hugo w/ Tangerine Scene" }),
    ["Hotel Hugo", "Tangerine Scene"],
  );
  assert.deepEqual(extractEventArtistNames({ category: "music", name: "Live Music at Purple Onion" }), []);
  assert.deepEqual(extractEventArtistNames({ category: "music", name: "TBA" }), []);
  assert.deepEqual(extractEventArtistNames({ category: "trivia", name: "The Steppers" }), []);
  assert.equal(artistLookupKey("  Sam   Godfrey BAND "), "sam godfrey band");
});
