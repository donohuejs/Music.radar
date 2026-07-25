import { distanceMiles } from "./geo.js";

export function eventFingerprint(event) {
  const date = (event.startTime || "").slice(0, 10);
  const clean = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  return [clean(event.name), clean(event.venueName), date].join("|");
}

export function mergeAndDedupe(events) {
  const deduped = new Map();

  for (const event of events) {
    const key = eventFingerprint(event);
    const current = deduped.get(key);

    if (!current) {
      deduped.set(key, event);
      continue;
    }

    deduped.set(key, {
      ...current,
      ...event,
      sourceName: [current.sourceName, event.sourceName].filter(Boolean).join(" + "),
      confidence: Math.max(current.confidence || 0, event.confidence || 0),
    });
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
    .filter((event) => event.distanceMiles === null || event.distanceMiles <= radius);
}
