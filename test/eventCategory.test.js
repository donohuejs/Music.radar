import test from "node:test";
import assert from "node:assert/strict";

import { inferEventCategory } from "../lib/server/eventCategory.js";

test("separates participatory listings from a source's broad music category", () => {
  assert.equal(
    inferEventCategory({ name: "Tuesday Open Mic", category: "music" }),
    "participatory",
  );
  assert.equal(
    inferEventCategory({ name: "Live Band Karaoke", category: "music" }),
    "participatory",
  );
  assert.equal(
    inferEventCategory({ name: "The Greenville Jazz Collective", category: "music" }),
    "music",
  );
});

test("separates trivia from a source's broad music category", () => {
  assert.equal(
    inferEventCategory({ name: "Trivia Club", category: "music" }),
    "trivia",
  );
  assert.equal(
    inferEventCategory({ name: "Wednesday Pub Quiz", category: "music" }),
    "trivia",
  );
});
