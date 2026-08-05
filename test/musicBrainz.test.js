import test from "node:test";
import assert from "node:assert/strict";

import {
  lookupArtistGenres,
  normalizeArtistName,
} from "../lib/server/musicBrainz.js";
import {
  artistCacheId,
  enrichArtistGenres,
  genreCacheIsFresh,
  genreProviderConfiguration,
} from "../lib/server/artistGenreEnrichment.js";

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

test("retries temporary MusicBrainz service failures", async () => {
  let attempts = 0;
  const waits = [];
  const result = await lookupArtistGenres("Example Artist", {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
        };
      }
      if (attempts === 2) {
        return {
          ok: true,
          json: async () => ({
            artists: [{ id: "artist-id", name: "Example Artist", score: 100 }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ genres: [{ name: "rock", count: 5 }] }),
      };
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(result.status, "matched");
  assert.deepEqual(result.genres, ["Rock"]);
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1500, 1100]);
});

test("does not retry permanent MusicBrainz failures", async () => {
  let attempts = 0;
  await assert.rejects(
    lookupArtistGenres("Example Artist", {
      fetchImpl: async () => {
        attempts += 1;
        return { ok: false, status: 400, headers: { get: () => null } };
      },
      wait: async () => {},
    }),
    /HTTP 400/,
  );
  assert.equal(attempts, 1);
});

test("returns provider-neutral genre evidence", async () => {
  const result = await enrichArtistGenres("Example Artist", {
    musicbrainz: {
      fetchImpl: async (url) => ({
        ok: true,
        json: async () => url.includes("/artist/?")
          ? { artists: [{ id: "artist-id", name: "Example Artist", score: 99 }] }
          : { genres: [{ name: "electronic", count: 4 }] },
      }),
      wait: async () => {},
    },
  });

  assert.equal(result.provider, "musicbrainz");
  assert.equal(result.providerArtistId, "artist-id");
  assert.deepEqual(result.genres, ["Electronic"]);
  assert.deepEqual(result.evidence.map(({ provider, status }) => ({ provider, status })), [
    { provider: "discogs", status: "unavailable" },
    { provider: "appleMusic", status: "unavailable" },
    { provider: "musicbrainz", status: "matched" },
  ]);
});

test("publishes only genres corroborated by multiple configured providers", async () => {
  const result = await enrichArtistGenres("Example Artist", {
    discogs: {
      token: "discogs-token",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ results: [
          { id: 1, title: "Example Artist - One", genre: ["Electronic"], style: [] },
          { id: 2, title: "Example Artist - Two", genre: ["Electronic"], style: [] },
        ] }),
      }),
    },
    appleMusic: {
      token: "apple-token",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ results: { artists: { data: [
          { id: "apple-id", attributes: { name: "Example Artist", genreNames: ["Electronic"] } },
        ] } } }),
      }),
    },
    musicbrainz: {
      fetchImpl: async (url) => ({
        ok: true,
        json: async () => url.includes("/artist/?")
          ? { artists: [{ id: "mbid", name: "Example Artist", score: 100 }] }
          : { genres: [{ name: "rock", count: 5 }] },
      }),
      wait: async () => {},
    },
  });

  assert.equal(result.status, "matched");
  assert.deepEqual(result.genres, ["Electronic"]);
  assert.equal(result.provider, "discogs+appleMusic+musicbrainz");
});

test("uses shorter cache freshness for unresolved artists", () => {
  const now = Date.parse("2026-08-05T12:00:00.000Z");
  const configuration = "musicbrainz";
  assert.equal(genreCacheIsFresh({ status: "matched", checkedAt: "2026-03-01T12:00:00.000Z", providerConfiguration: configuration }, now, configuration), true);
  assert.equal(genreCacheIsFresh({ status: "no-match", checkedAt: "2026-06-01T12:00:00.000Z", providerConfiguration: configuration }, now, configuration), false);
});

test("invalidates genre caches when a provider becomes available", () => {
  const musicBrainzOnly = genreProviderConfiguration({});
  const withDiscogs = genreProviderConfiguration({ DISCOGS_TOKEN: "secret" });
  const cache = {
    status: "matched",
    checkedAt: new Date().toISOString(),
    providerConfiguration: musicBrainzOnly,
  };
  assert.equal(genreCacheIsFresh(cache, Date.now(), musicBrainzOnly), true);
  assert.equal(genreCacheIsFresh(cache, Date.now(), withDiscogs), false);
});
