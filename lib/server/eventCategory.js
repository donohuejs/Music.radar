export const EVENT_CATEGORIES = [
  "music",
  "theater",
  "comedy",
  "community",
  "other",
];

export function normalizeEventCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return EVENT_CATEGORIES.includes(category) ? category : null;
}

export function inferEventCategory(event, hint = "") {
  const explicit = normalizeEventCategory(event?.category);
  if (explicit) return explicit;

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

  if (
    /\b(concert|music|band|singer|song|rock|pop|country|jazz|blues|metal|punk|indie|electronic|hip[- ]?hop|r&b|tribute)\b/.test(
      text,
    )
  ) {
    return "music";
  }

  return "other";
}
