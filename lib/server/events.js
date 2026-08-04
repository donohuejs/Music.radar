import { normalizeEvent } from "./cleanEvent.js";
import { distanceMiles } from "./geo.js";

export function eventFingerprint(event) {
  const clean = (value) =>
    String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const artist = clean(event.artistName || event.name);
  const start = new Date(event.startTime).toISOString().slice(0, 16);
  const postalCode = clean(event.postalCode);
  const venue = clean(event.venueName)
    .replace(/^the\s+/, "")
    .replace(/\s+[a-z]{2}$/, "")
    .trim();
  const address = clean(event.address)
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(boulevard)\b/g, "blvd");

  if (artist && postalCode) return [artist, start, postalCode].join("|");
  if (artist && venue) return [artist, start, venue].join("|");
  return [clean(event.name), start, address || venue].join("|");
}

function eventQuality(event) {
  return (
    String(event.name || "").length +
    (event.address ? 8 : 0) +
    (event.postalCode ? 4 : 0) +
    (event.ticketUrl ? 2 : 0) +
    (event.imageUrl ? 1 : 0)
  );
}

function mergeDuplicateEvents(first, second) {
  const preferred = eventQuality(second) > eventQuality(first) ? second : first;
  const alternate = preferred === first ? second : first;
  const sourceNames = [...new Set([first.sourceName, second.sourceName].filter(Boolean))];
  const externalIds = [
    ...new Set([
      ...(first.externalIds || []),
      first.externalId,
      ...(second.externalIds || []),
      second.externalId,
    ].filter(Boolean)),
  ];
  const ticketUrls = [
    ...new Set([
      ...(first.ticketUrls || []),
      first.ticketUrl,
      ...(second.ticketUrls || []),
      second.ticketUrl,
    ].filter(Boolean)),
  ];

  return {
    ...alternate,
    ...preferred,
    sourceName: sourceNames.join(" + "),
    confidence: Math.max(first.confidence || 0, second.confidence || 0),
    externalIds,
    ticketUrls,
  };
}

export function mergeAndDedupe(events) {
  const deduped = new Map();

  for (const rawEvent of events) {
    const event = normalizeEvent(rawEvent);
    if (!event) continue;

    const key = eventFingerprint(event);
    const current = deduped.get(key);

    if (!current) {
      deduped.set(key, event);
      continue;
    }

    deduped.set(key, mergeDuplicateEvents(current, event));
  }

  return [...deduped.values()];
}

export function attachDistanceAndFilter(events, lat, lng, radius) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return events;

  return events
    .map((event) => {
      const distance = distanceMiles(lat, lng, event.latitude, event.longitude);
      return { ...event, distanceMiles: distance };
    })
    .filter(
      (event) =>
        Number.isFinite(event.distanceMiles) && event.distanceMiles <= radius,
    );
}
