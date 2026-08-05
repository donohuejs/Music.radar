import { inferEventGenres } from "./eventGenres.js";

const API_ROOT = "https://api.discogs.com";
const USER_AGENT = "MusicRadar/2.0 +https://music-radar-one.vercel.app";

function normalizeResultTitle(value) {
  return String(value || "").split(" - ")[0].replace(/\s+\(\d+\)$/, "").trim();
}

function comparable(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function lookupDiscogsGenres(
  artistName,
  { fetchImpl = fetch, token = process.env.DISCOGS_TOKEN } = {},
) {
  if (!token) return { status: "unavailable", genres: [] };

  const parameters = new URLSearchParams({
    artist: artistName,
    type: "release",
    per_page: "10",
  });
  const response = await fetchImpl(`${API_ROOT}/database/search?${parameters}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Discogs token=${token}`,
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    const error = new Error(`Discogs returned HTTP ${response.status}.`);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }

  const results = (await response.json()).results || [];
  const exact = results.filter((result) => comparable(normalizeResultTitle(result.title)) === comparable(artistName));
  if (exact.length < 2) return { status: "no-match", genres: [] };

  const counts = new Map();
  for (const result of exact) {
    const normalized = inferEventGenres({
      category: "music",
      genres: [...(result.genre || []), ...(result.style || [])],
    }).filter((genre) => genre !== "Genre not listed");
    for (const genre of new Set(normalized)) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  const genres = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre)
    .slice(0, 5);

  return {
    status: genres.length ? "matched" : "no-genres",
    artistName,
    providerArtistId: exact[0].id ? String(exact[0].id) : null,
    confidence: 0.9,
    genres,
  };
}
