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

test("lets specific theater and comedy evidence override a broad source category", () => {
  assert.equal(
    inferEventCategory({ name: "Hamilton Broadway Musical", category: "music" }),
    "theater",
  );
  assert.equal(
    inferEventCategory({ name: "Friday Stand-Up Comedy", category: "music" }),
    "comedy",
  );
});
