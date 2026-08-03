import { inferEventCategory } from "./eventCategory.js";
import { inferEventGenres } from "./eventGenres.js";

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name) =>
      Object.hasOwn(HTML_ENTITIES, name.toLowerCase())
        ? HTML_ENTITIES[name.toLowerCase()]
        : match,
    );
}

export function repairMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂâ]/.test(text)) return text;

  try {
    const windows1252 = new Map([
      [0x20ac, 0x80],
      [0x201a, 0x82],
      [0x0192, 0x83],
      [0x201e, 0x84],
      [0x2026, 0x85],
      [0x2020, 0x86],
      [0x2021, 0x87],
      [0x02c6, 0x88],
      [0x2030, 0x89],
      [0x0160, 0x8a],
      [0x2039, 0x8b],
      [0x0152, 0x8c],
      [0x017d, 0x8e],
      [0x2018, 0x91],
      [0x2019, 0x92],
      [0x201c, 0x93],
      [0x201d, 0x94],
      [0x2022, 0x95],
      [0x2013, 0x96],
      [0x2014, 0x97],
      [0x02dc, 0x98],
      [0x2122, 0x99],
      [0x0161, 0x9a],
      [0x203a, 0x9b],
      [0x0153, 0x9c],
      [0x017e, 0x9e],
      [0x0178, 0x9f],
    ]);
    const bytes = Uint8Array.from(
      Array.from(text, (character) => {
        const codePoint = character.codePointAt(0);
        return windows1252.get(codePoint) ?? codePoint;
      }),
    );
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return repaired.includes("�") ? text : repaired;
  } catch {
    return text;
  }
}

export function cleanEventText(value) {
  if (value === null || value === undefined) return null;

  const cleaned = repairMojibake(decodeEntities(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

export function cleanEventTitle(value, venueName) {
  const title = cleanEventText(value);
  const venue = cleanEventText(venueName);
  if (!title || !venue) return title;

  const escapedVenue = venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    title
      .replace(new RegExp(`\\s*(?:[-–—|@]|\\bat\\b)\\s*${escapedVenue}\\s*$`, "i"), "")
      .trim() || title
  );
}

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeEvent(event) {
  if (!event || typeof event !== "object") return null;

  const venueName = cleanEventText(event.venueName);
  const name = cleanEventTitle(event.name || event.artistName, venueName);
  const startTime = cleanEventText(event.startTime);
  const startTimestamp = startTime ? new Date(startTime).getTime() : Number.NaN;

  if (!name || !Number.isFinite(startTimestamp)) return null;

  return {
    ...event,
    name,
    artistName: cleanEventText(event.artistName) || name,
    venueName,
    address: cleanEventText(event.address),
    city: cleanEventText(event.city),
    state: cleanEventText(event.state),
    postalCode: cleanEventText(event.postalCode),
    startTime,
    endTime: cleanEventText(event.endTime),
    latitude: finiteCoordinate(event.latitude),
    longitude: finiteCoordinate(event.longitude),
    sourceName: cleanEventText(event.sourceName),
    category: inferEventCategory(event),
    genres: inferEventGenres(event),
  };
}
