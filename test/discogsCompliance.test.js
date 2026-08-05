import test from "node:test";
import assert from "node:assert/strict";

import { applyDiscogsDisplayCompliance } from "../lib/server/discogsCompliance.js";

const now = Date.parse("2026-08-05T12:00:00.000Z");

test("exposes fresh Discogs attribution beside enriched genres", () => {
  const event = applyDiscogsDisplayCompliance({
    genres: ["Electronic"],
    genreEnrichment: {
      discogsAttribution: {
        sourceUrl: "https://www.discogs.com/release/1-example",
        observedAt: "2026-08-05T08:00:00.000Z",
      },
    },
  }, now);

  assert.deepEqual(event.genres, ["Electronic"]);
  assert.equal(event.genreAttribution.label, "Data provided by Discogs.");
  assert.equal(event.genreEnrichment, undefined);
});

test("suppresses Discogs-influenced genres after six hours", () => {
  const event = applyDiscogsDisplayCompliance({
    genres: ["Electronic"],
    genreEnrichment: {
      discogsAttribution: {
        sourceUrl: "https://www.discogs.com/release/1-example",
        observedAt: "2026-08-05T05:59:59.000Z",
      },
    },
  }, now);

  assert.deepEqual(event.genres, ["Genre not listed"]);
  assert.equal(event.genreAttribution, undefined);
});

test("rejects non-Discogs attribution links", () => {
  const event = applyDiscogsDisplayCompliance({
    genres: ["Rock"],
    genreEnrichment: {
      discogsAttribution: {
        sourceUrl: "https://example.com/release/1",
        observedAt: "2026-08-05T11:00:00.000Z",
      },
    },
  }, now);

  assert.deepEqual(event.genres, ["Genre not listed"]);
});
