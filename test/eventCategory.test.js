import test from "node:test";
import assert from "node:assert/strict";

import { inferEventCategory, isNonPerformanceListing } from "../lib/server/eventCategory.js";

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
  assert.equal(
    inferEventCategory({ name: "NEW GROOVE: Music Bingo with Jen", category: "music" }),
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

test("excludes explicit venue-hours and no-performance placeholders", () => {
  assert.equal(isNonPerformanceListing({ name: "Radio and Chill" }), true);
  assert.equal(isNonPerformanceListing({ name: "Bar Open — No Show Tonight" }), true);
  assert.equal(isNonPerformanceListing({ name: "Chillwave Radio with The Performers" }), false);
  assert.equal(isNonPerformanceListing({ name: "Radiohead Tribute Night" }), false);
});
