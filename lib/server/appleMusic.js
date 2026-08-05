import { inferEventGenres } from "./eventGenres.js";

const API_ROOT = "https://api.music.apple.com/v1";

function comparable(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function lookupAppleMusicGenres(
  artistName,
  {
    fetchImpl = fetch,
    token = process.env.APPLE_MUSIC_DEVELOPER_TOKEN,
    storefront = process.env.APPLE_MUSIC_STOREFRONT || "us",
  } = {},
) {
  if (!token) return { status: "unavailable", genres: [] };

  const parameters = new URLSearchParams({ term: artistName, types: "artists", limit: "5" });
  const response = await fetchImpl(`${API_ROOT}/catalog/${encodeURIComponent(storefront)}/search?${parameters}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(`Apple Music returned HTTP ${response.status}.`);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }

  const artists = (await response.json()).results?.artists?.data || [];
  const candidate = artists.find((artist) => comparable(artist.attributes?.name) === comparable(artistName));
  if (!candidate) return { status: "no-match", genres: [] };

  const genres = inferEventGenres({
    category: "music",
    genres: candidate.attributes?.genreNames || [],
  }).filter((genre) => genre !== "Genre not listed");

  return {
    status: genres.length ? "matched" : "no-genres",
    artistName: candidate.attributes?.name,
    providerArtistId: candidate.id || null,
    confidence: 0.95,
    genres,
  };
}
