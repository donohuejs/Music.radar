import { absoluteUrl, fetchHtml, stripHtml } from "./htmlUtils.js";
import { slugify } from "./venueParsers.js";

function unescapeCalendarText(value = "") {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function propertyMap(block) {
  const properties = new Map();
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const descriptor = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const [name, ...parameters] = descriptor.split(";");
    properties.set(name.toUpperCase(), {
      value,
      parameters: Object.fromEntries(
        parameters.map((parameter) => {
          const [key, ...parts] = parameter.split("=");
          return [key.toUpperCase(), parts.join("=")];
        }),
      ),
    });
  }
  return properties;
}

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
  const represented = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return represented - date.getTime();
}

function calendarDate(property) {
  if (!property?.value) return null;
  const value = property.value.trim();

  if (/^\d{8}$/.test(value)) {
    return new Date(
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
        19,
      ),
    );
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, year, month, day, hour, minute, second, utc] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (utc) return new Date(timestamp);

  const timeZone = property.parameters.TZID;
  if (!timeZone) return new Date(timestamp);

  try {
    const guess = new Date(timestamp);
    return new Date(timestamp - timezoneOffset(guess, timeZone));
  } catch {
    return new Date(timestamp);
  }
}

function feedEvent(source, values, index) {
  const name = unescapeCalendarText(values.get("SUMMARY")?.value);
  const start = calendarDate(values.get("DTSTART"));
  if (!name || !start || Number.isNaN(start.getTime())) return null;

  const end = calendarDate(values.get("DTEND"));
  const location = unescapeCalendarText(values.get("LOCATION")?.value);
  const url = absoluteUrl(values.get("URL")?.value, source.url) || source.url;
  const uid = unescapeCalendarText(values.get("UID")?.value);

  return {
    id: `${source.id}:${slugify(uid || name)}:${start.toISOString()}:${index}`,
    externalId: uid || null,
    name,
    artistName: name,
    venueName: source.venueName || source.name,
    address: location || source.address || null,
    city: source.city || null,
    state: source.state || null,
    postalCode: source.postalCode || null,
    latitude: Number(source.latitude),
    longitude: Number(source.longitude),
    startTime: start.toISOString(),
    endTime: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
    ticketUrl: url,
    imageUrl: source.imageUrl || null,
    genres: source.genres || [],
    category: source.category || "music",
    sourceName: source.name,
    sourceUrl: url,
    sourceId: source.id,
    confidence: 0.88,
    lastVerifiedAt: new Date().toISOString(),
  };
}

export function parseICalendar(text, source) {
  const unfolded = String(text).replace(/\r?\n[ \t]/g, "");
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/gi)];
  return blocks
    .map((match, index) => feedEvent(source, propertyMap(match[1]), index))
    .filter(Boolean);
}

export async function fetchICalendarEvents(source) {
  return parseICalendar(await fetchHtml(source.url), source);
}

function xmlValue(block, names) {
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    const match = block.match(
      new RegExp(`<${escaped}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${escaped}>`, "i"),
    );
    if (match?.[1]) return stripHtml(match[1]);
  }
  return null;
}

export function parseEventRss(text, source) {
  const items = [...String(text).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  return items
    .map((match, index) => {
      const block = match[1];
      const name = xmlValue(block, ["title"]);
      const startValue = xmlValue(block, [
        "event:start",
        "ev:startdate",
        "startDate",
        "start",
      ]);
      const start = startValue ? new Date(startValue) : null;
      if (!name || !start || Number.isNaN(start.getTime())) return null;

      const link = absoluteUrl(xmlValue(block, ["link", "guid"]), source.url);
      return {
        id: `${source.id}:${slugify(name)}:${start.toISOString()}:${index}`,
        externalId: xmlValue(block, ["guid"]),
        name,
        artistName: name,
        venueName: source.venueName || source.name,
        address: source.address || null,
        city: source.city || null,
        state: source.state || null,
        postalCode: source.postalCode || null,
        latitude: Number(source.latitude),
        longitude: Number(source.longitude),
        startTime: start.toISOString(),
        endTime: null,
        ticketUrl: link,
        imageUrl: source.imageUrl || null,
        genres: source.genres || [],
        category: source.category || "music",
        sourceName: source.name,
        sourceUrl: link || source.url,
        sourceId: source.id,
        confidence: 0.82,
        lastVerifiedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export async function fetchRssEvents(source) {
  return parseEventRss(await fetchHtml(source.url), source);
}
