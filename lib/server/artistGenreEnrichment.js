import { createHash } from "node:crypto";

import { lookupAppleMusicGenres } from "./appleMusic.js";
import { lookupDiscogsGenres } from "./discogs.js";
import { lookupArtistGenres as lookupMusicBrainzGenres } from "./musicBrainz.js";

const PROVIDERS = [
  { name: "discogs", lookup: lookupDiscogsGenres },
  { name: "appleMusic", lookup: lookupAppleMusicGenres },
  {
    name: "musicbrainz",
    lookup: lookupMusicBrainzGenres,
  },
];

export function normalizeArtistName(value) {
  return String(value || "")
    .replace(/\s+(?:with|w\/|featuring|feat\.?|ft\.?)\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function artistCacheId(value) {
  return createHash("sha256")
    .update(normalizeArtistName(value).toLowerCase())
    .digest("hex");
}

export function genreProviderConfiguration(environment = process.env) {
  return [
    environment.DISCOGS_TOKEN ? "discogs" : null,
    environment.APPLE_MUSIC_DEVELOPER_TOKEN ? "appleMusic" : null,
    "musicbrainz",
  ].filter(Boolean).join("+");
}

export function genreCacheIsFresh(
  cache,
  now = Date.now(),
  providerConfiguration = genreProviderConfiguration(),
) {
  if (cache?.providerConfiguration !== providerConfiguration) return false;
  const checkedAt = new Date(cache?.checkedAt).getTime();
  const maxAgeDays = cache?.status === "matched" ? 180 : 30;
  return Number.isFinite(checkedAt) && now - checkedAt < maxAgeDays * 24 * 60 * 60 * 1000;
}

export async function enrichArtistGenres(artistName, options = {}) {
  const normalizedName = normalizeArtistName(artistName);
  if (!normalizedName) return { status: "no-match", genres: [], evidence: [] };

  const evidence = [];
  const errors = [];
  for (const provider of PROVIDERS) {
    let result;
    try {
      result = await provider.lookup(normalizedName, options[provider.name]);
    } catch (error) {
      errors.push({ provider: provider.name, message: error.message, retryable: Boolean(error.retryable) });
      continue;
    }
    evidence.push({
      provider: provider.name,
      status: result.status,
      artistName: result.artistName || null,
      providerArtistId: result.providerArtistId || result.mbid || null,
      matchConfidence: result.confidence ?? null,
      genres: result.genres || [],
    });
  }

  const matched = evidence.filter((item) => item.status === "matched" && item.genres.length);
  if (matched.length) {
    const genreVotes = new Map();
    for (const item of matched) {
      for (const genre of new Set(item.genres)) genreVotes.set(genre, (genreVotes.get(genre) || 0) + 1);
    }
    const requiredVotes = matched.length > 1 ? 2 : 1;
    const genres = [...genreVotes.entries()]
      .filter(([, votes]) => votes >= requiredVotes)
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre)
      .slice(0, 5);
    const primary = matched[0];
    return {
      status: genres.length ? "matched" : "conflict",
      genres,
      artistName: primary.artistName,
      provider: matched.map((item) => item.provider).join("+"),
      providerArtistId: primary.providerArtistId,
      confidence: genres.length && matched.length > 1 ? 0.95 : primary.matchConfidence,
      queryArtistName: normalizedName,
      evidence,
      errors,
    };
  }

  if (errors.length) {
    const error = new Error(`Genre providers failed: ${errors.map((item) => item.message).join("; ")}`);
    error.retryable = errors.some((item) => item.retryable);
    error.providers = errors;
    throw error;
  }

  return {
    status: evidence.some((item) => item.status === "no-genres") ? "no-genres" : "no-match",
    genres: [],
    queryArtistName: normalizedName,
    evidence,
    errors,
  };
}
