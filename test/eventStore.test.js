import test from "node:test";
import assert from "node:assert/strict";

import { genreLookupFields } from "../lib/server/eventStore.js";

test("marks extractable artists pending and generic listings unavailable", () => {
  assert.deepEqual(genreLookupFields({
    category: "music",
    name: "Sam Godfrey Band - Free Live Music",
    genres: ["Genre not listed"],
  }), {
    artistNames: ["Sam Godfrey Band"],
    artistLookupKeys: ["sam godfrey band"],
    genreStatus: "pending",
  });
  assert.deepEqual(genreLookupFields({
    category: "music",
    name: "Live Music",
    genres: ["Genre not listed"],
  }), {
    artistNames: [],
    artistLookupKeys: [],
    genreStatus: "unavailable",
  });
});

test("preserves previously enriched genres during source re-ingestion", () => {
  assert.deepEqual(genreLookupFields({
    category: "music",
    name: "Tinsley Ellis",
    genres: ["Genre not listed"],
  }, {
    genres: ["Blues", "Rock"],
  }), {
    artistNames: ["Tinsley Ellis"],
    artistLookupKeys: ["tinsley ellis"],
    genreStatus: "matched",
    genres: ["Blues", "Rock"],
  });
});
