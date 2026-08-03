const GENRE_RULES = [
  ["Rock", /\b(rock|rockabilly|alternative|grunge)\b/i],
  ["Indie", /\b(indie|independent)\b/i],
  ["Pop", /\b(pop|synthpop)\b/i],
  ["Country", /\b(country|americana|bluegrass|honky[- ]?tonk)\b/i],
  ["Jazz", /\b(jazz|swing|bebop)\b/i],
  ["Blues", /\bblues\b/i],
  ["R&B", /\b(r&b|rhythm and blues)\b/i],
  ["Soul", /\bsoul\b/i],
  ["Funk", /\bfunk\b/i],
  ["Hip-Hop", /\b(hip[- ]?hop|rap)\b/i],
  ["Electronic", /\b(electronic|edm|house|techno|dance music)\b/i],
  ["Metal", /\bmetal\b/i],
  ["Punk", /\bpunk\b/i],
  ["Reggae", /\b(reggae|ska)\b/i],
  ["Latin", /\b(latin|salsa|bachata|cumbia)\b/i],
  ["Classical", /\b(classical|symphony|orchestra|chamber music)\b/i],
  ["Folk", /\bfolk\b/i],
  ["Beach", /\bbeach\b/i],
  ["Tribute", /\btribute\b/i],
];

export function inferEventGenres(event) {
  const supplied = Array.isArray(event?.genres) ? event.genres : [];
  const text = [event?.name, event?.artistName, ...supplied]
    .filter(Boolean)
    .join(" ");
  const inferred = GENRE_RULES
    .filter(([, pattern]) => pattern.test(text))
    .map(([genre]) => genre);

  // Keep useful provider genres that do not map to a canonical label.
  const extras = supplied
    .map((genre) => String(genre || "").trim())
    .filter((genre) => genre && !/^(music|undefined|other)$/i.test(genre))
    .filter((genre) => !GENRE_RULES.some(([, pattern]) => pattern.test(genre)));

  const genres = [...new Set([...inferred, ...extras])].slice(0, 5);
  return genres.length || event?.category !== "music"
    ? genres
    : ["Genre not listed"];
}
