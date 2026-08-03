import test from "node:test";
import assert from "node:assert/strict";

import { inferEventGenres } from "../lib/server/eventGenres.js";

test("normalizes supplied and title-based genres without duplicates", () => {
  assert.deepEqual(
    inferEventGenres({ name: "Classic Country Tribute", genres: ["country", "tribute"] }),
    ["Country", "Tribute"],
  );
  assert.deepEqual(
    inferEventGenres({ name: "An Evening with the Orchestra", genres: [] }),
    ["Classical"],
  );
});

test("keeps every music event available through the genre filter", () => {
  assert.deepEqual(
    inferEventGenres({ name: "An Artist Without Metadata", category: "music" }),
    ["Genre not listed"],
  );
  assert.deepEqual(
    inferEventGenres({ name: "Trivia Night", category: "trivia" }),
    [],
  );
});
