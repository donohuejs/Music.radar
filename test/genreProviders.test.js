import test from "node:test";
import assert from "node:assert/strict";

import { lookupAppleMusicGenres } from "../lib/server/appleMusic.js";
import { lookupDiscogsGenres } from "../lib/server/discogs.js";

test("skips credentialed genre providers when credentials are absent", async () => {
  assert.equal((await lookupDiscogsGenres("Example", { token: "" })).status, "unavailable");
  assert.equal((await lookupAppleMusicGenres("Example", { token: "" })).status, "unavailable");
});

test("uses repeated Discogs release classifications for an exact artist", async () => {
  const result = await lookupDiscogsGenres("Cabaret Voltaire", {
    token: "test-token",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        results: [
          { id: 1, title: "Cabaret Voltaire - Mix-Up", genre: ["Electronic"], style: ["Industrial"] },
          { id: 2, title: "Cabaret Voltaire - Red Mecca", genre: ["Electronic"], style: ["Industrial"] },
          { id: 3, title: "Cabaret Voltaire (2) - Other", genre: ["Rock"], style: [] },
        ],
      }),
    }),
  });

  assert.equal(result.status, "matched");
  assert.deepEqual(result.genres, ["Electronic", "Industrial"]);
});

test("requires an exact Apple Music artist name", async () => {
  const result = await lookupAppleMusicGenres("Example Artist", {
    token: "developer-token",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        results: {
          artists: {
            data: [
              { id: "wrong", attributes: { name: "Example Artist UK", genreNames: ["Pop"] } },
              { id: "right", attributes: { name: "Example Artist", genreNames: ["Alternative", "Music"] } },
            ],
          },
        },
      }),
    }),
  });

  assert.equal(result.status, "matched");
  assert.equal(result.providerArtistId, "right");
  assert.deepEqual(result.genres, ["Rock"]);
});
