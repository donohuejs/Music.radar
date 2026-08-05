import { inferEventGenres } from "./eventGenres.js";

const API_ROOT = "https://musicbrainz.org/ws/2";
const USER_AGENT = "MusicRadar/2.0 (https://music-radar-one.vercel.app)";
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export function normalizeArtistName(value) {
  return String(value || "")
    .replace(/\s+(?:with|w\/|featuring|feat\.?|ft\.?)\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function comparable(value) {
  return normalizeArtistName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function exactNameMatch(candidate, artistName) {
  const target = comparable(artistName);
  return [candidate?.name, ...(candidate?.aliases || []).map((alias) => alias.name)]
    .some((name) => comparable(name) === target);
}

async function musicBrainzRequest(path, fetchImpl, wait) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(`${API_ROOT}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (response.ok) return response.json();

    const retryable = RETRYABLE_STATUSES.has(response.status);
    if (retryable && attempt < 2) {
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1500 * (attempt + 1);
      await wait(delay);
      continue;
    }

    const error = new Error(`MusicBrainz returned HTTP ${response.status}.`);
    error.status = response.status;
    error.retryable = retryable;
    throw error;
  }
}

export async function lookupArtistGenres(
  artistName,
  { fetchImpl = fetch, wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {},
) {
  const normalizedName = normalizeArtistName(artistName);
  if (!normalizedName) return { status: "no-match", genres: [] };

  const query = encodeURIComponent(`artist:\"${normalizedName.replaceAll('"', "")}\"`);
  const search = await musicBrainzRequest(
    `/artist/?query=${query}&limit=3&fmt=json`,
    fetchImpl,
    wait,
  );
  const candidate = (search.artists || []).find(
    (artist) => Number(artist.score) >= 90 && exactNameMatch(artist, normalizedName),
  );
  if (!candidate) return { status: "no-match", genres: [] };

  await wait(1100);
  const detail = await musicBrainzRequest(
    `/artist/${candidate.id}?inc=genres&fmt=json`,
    fetchImpl,
    wait,
  );
  const suppliedGenres = [...(detail.genres || [])]
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .map((genre) => genre.name)
    .filter(Boolean);
  const genres = inferEventGenres({
    name: normalizedName,
    category: "music",
    genres: suppliedGenres,
  }).filter((genre) => genre !== "Genre not listed");

  return {
    status: genres.length ? "matched" : "no-genres",
    artistName: candidate.name,
    mbid: candidate.id,
    providerArtistId: candidate.id,
    confidence: Number(candidate.score) / 100,
    genres,
  };
}
