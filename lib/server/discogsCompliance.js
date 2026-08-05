const DISCOGS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function applyDiscogsDisplayCompliance(event, now = Date.now()) {
  const attribution = event?.genreEnrichment?.discogsAttribution;
  if (!attribution) return event;

  const observedAt = new Date(attribution.observedAt).getTime();
  const sourceUrl = String(attribution.sourceUrl || "");
  const fresh = Number.isFinite(observedAt) && now - observedAt < DISCOGS_MAX_AGE_MS;
  const validUrl = /^https:\/\/(?:www\.)?discogs\.com\//i.test(sourceUrl);

  if (!fresh || !validUrl) {
    return {
      ...event,
      genres: ["Genre not listed"],
      genreEnrichment: undefined,
      genreAttribution: undefined,
    };
  }

  return {
    ...event,
    genreEnrichment: undefined,
    genreAttribution: {
      provider: "discogs",
      label: "Data provided by Discogs.",
      sourceUrl,
    },
  };
}
