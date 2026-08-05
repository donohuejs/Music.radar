import { slugify } from "./venueParsers.js";

function timezoneOffset(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  ) - date.getTime();
}

export function localDateTime(date, time, timeZone) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = new Date(timestamp);
  return new Date(timestamp - timezoneOffset(guess, timeZone));
}

export function parseSeriesSchedule(source) {
  if (!Array.isArray(source.schedule)) return [];

  return source.schedule.flatMap((entry) => {
    if (!entry?.date || !entry?.name || /\bno concert\b/i.test(entry.name)) {
      return [];
    }

    const start = localDateTime(
      entry.date,
      entry.startTime || source.startTime,
      source.timeZone,
    );
    const end = localDateTime(
      entry.date,
      entry.endTime || source.endTime,
      source.timeZone,
    );
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];

    return [{
      id: `${source.id}:${entry.date}:${slugify(entry.name)}`,
      externalId: `${source.id}:${entry.date}`,
      name: entry.name,
      artistName: entry.name,
      venueName: source.venueName || source.name,
      address: source.address || null,
      city: source.city || null,
      state: source.state || null,
      postalCode: source.postalCode || null,
      latitude: Number(source.latitude),
      longitude: Number(source.longitude),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      ticketUrl: source.url,
      imageUrl: source.imageUrl || null,
      genres: entry.genres || source.genres || [],
      category: "music",
      sourceName: source.name,
      sourceUrl: source.url,
      sourceId: source.id,
      confidence: 0.94,
      lastVerifiedAt: new Date().toISOString(),
    }];
  });
}
