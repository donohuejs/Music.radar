import { createHash } from "node:crypto";

const GENERIC_EVENT_TITLE = /^(?:tba|tbd|live music|free live music|music|entertainment)(?:\s+(?:at|on)\b.*)?$/i;
const MARKETING_SUFFIX = /\s*[-–—|]\s*(?:free\s+)?live music(?:\s+(?:at|on)\b.*)?\s*$/i;
const SERIES_SUFFIX = /[’']s\s+(?:[a-z]+\s+){0,3}(?:music|concert)\s+series\s*$/i;
const GUEST_SEPARATOR = /\s+(?:w\/|with|featuring|feat\.?|ft\.?)\s+/i;

export function normalizeArtistName(value) {
  return String(value || "")
    .replace(/\s+(?:with|w\/|featuring|feat\.?|ft\.?)\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function artistLookupKey(value) {
  return normalizeArtistName(value).toLocaleLowerCase();
}

export function artistCacheId(value) {
  return createHash("sha256")
    .update(artistLookupKey(value))
    .digest("hex");
}

function titleCandidate(value) {
  let title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title || GENERIC_EVENT_TITLE.test(title)) return "";

  const parentheticalArtists = title.match(/\(([^()]+)\)\s*$/)?.[1];
  if (parentheticalArtists && /(?:happy hour|music|concert|series)/i.test(title.slice(0, title.lastIndexOf("(")))) {
    title = parentheticalArtists;
  }

  title = title
    .replace(MARKETING_SUFFIX, "")
    .replace(SERIES_SUFFIX, "")
    .replace(/^music\s+(?:sandwiched\s+in|series)\s*[-–—:]\s*/i, "")
    .trim();

  if (GENERIC_EVENT_TITLE.test(title)) return "";
  return title;
}

export function extractEventArtistNames(event = {}) {
  if (event.category && event.category !== "music") return [];
  const candidate = titleCandidate(event.artistName || event.name);
  if (!candidate) return [];

  const names = candidate
    .split(GUEST_SEPARATOR)
    .flatMap((name) => {
      // Parenthetical series credits commonly contain multiple solo artists.
      if (candidate === name && /\([^()]+\)\s*$/.test(String(event.artistName || event.name || ""))) {
        return name.split(/\s+&\s+/);
      }
      return [name];
    })
    .map(normalizeArtistName)
    .filter((name) => name && !GENERIC_EVENT_TITLE.test(name));

  return [...new Map(names.map((name) => [artistLookupKey(name), name])).values()].slice(0, 4);
}
