import test from "node:test";
import assert from "node:assert/strict";

import {
  artistCacheId,
  lookupArtistGenres,
  normalizeArtistName,
} from "../lib/server/musicBrainz.js";

test("normalizes artist billing text and stable cache ids", () => {
  assert.equal(normalizeArtistName("Example Artist feat. A Guest"), "Example Artist");
  assert.equal(artistCacheId("Example Artist"), artistCacheId(" example   artist "));
});

test("accepts an exact high-confidence match and normalizes its genres", async () => {
  const requests = [];
  const responses = [
    {
      artists: [{
        id: "artist-id",
        name: "Example Artist",
        score: 98,
        aliases: [],
      }],
    },
    {
      genres: [
        { name: "alternative rock", count: 8 },
        { name: "indie", count: 5 },
      ],
    },
  ];
  const result = await lookupArtistGenres("Example Artist", {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => responses.shift() };
    },
    wait: async () => {},
  });

  assert.equal(result.status, "matched");
  assert.deepEqual(result.genres, ["Rock", "Indie"]);
  assert.equal(requests.length, 2);
  assert.match(requests[0].options.headers["User-Agent"], /MusicRadar/);
});

test("rejects a fuzzy artist result even when its search score is high", async () => {
  const result = await lookupArtistGenres("The Local Band", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        artists: [{ id: "wrong-id", name: "The Local Band UK", score: 100 }],
      }),
    }),
    wait: async () => {},
  });
  assert.equal(result.status, "no-match");
  assert.deepEqual(result.genres, []);
});
