export const EVENT_CATEGORIES = [
  "music",
  "participatory",
  "trivia",
  "theater",
  "comedy",
  "community",
  "other",
];

export function normalizeEventCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return EVENT_CATEGORIES.includes(category) ? category : null;
}

export function isNonPerformanceListing(event) {
  const title = String(event?.name || event?.artistName || "")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Venue-hours and no-show placeholders sometimes appear in event calendars.
  // Keep this deliberately conservative: these phrases explicitly say that no
  // artist performance is being presented.
  return (
    /\bradio\s*(?:&|and)\s*chill\b/.test(title) ||
    /\bno\s+(?:live\s+music|show|performance)(?:\s+tonight)?\b/.test(title) ||
    /\b(?:bar|venue)\s+(?:is\s+)?open\b.*\bno\s+(?:show|live\s+music|performance)\b/.test(title)
  );
}

export function inferEventCategory(event, hint = "") {
  const explicit = normalizeEventCategory(event?.category);

  const text = [
    event?.name,
    event?.artistName,
    event?.sourceName,
    ...(Array.isArray(event?.genres) ? event.genres : []),
    hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(trivia(?: club| night)?|pub quiz|quiz night)\b/.test(text)) {
    return "trivia";
  }

  // A source may broadly label every listing as music. These audience-led
  // formats should still be kept separate from artist performances.
  if (
    /\b(open mic|open mike|open jam|jam session|live band karaoke|band karaoke|karaoke|sing[- ]?along)\b/.test(
      text,
    )
  ) {
    return "participatory";
  }

  if (
    /\b(broadway|musical|theatre|theater|play|opera|ballet|dance company)\b/.test(
      text,
    )
  ) {
    return "theater";
  }

  if (/\b(comedy|comedian|stand[- ]?up|improv)\b/.test(text)) {
    return "comedy";
  }

  if (explicit) return explicit;

  if (
    /\b(concert|music|band|singer|song|rock|pop|country|jazz|blues|metal|punk|indie|electronic|hip[- ]?hop|r&b|tribute)\b/.test(
      text,
    )
  ) {
    return "music";
  }

  return "other";
}
