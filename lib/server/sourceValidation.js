import { EVENT_CATEGORIES } from "./eventCategory.js";

export const ALLOWED_SOURCE_PARSERS = new Set([
  "ical",
  "calendar-page",
  "rss",
  "json-ld",
  "json-ld-listing",
  "radio-room",
  "squarespace",
  "peace-center",
  "foundry",
  "series-schedule",
]);

export function sourceId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function validateSource(input) {
  const id = sourceId(input.id || input.name);
  const name = String(input.name || "").trim();
  const parser = String(input.parser || "").trim().toLowerCase();
  const category = input.category ? String(input.category).trim().toLowerCase() : null;
  let url;

  try {
    url = new URL(input.url);
  } catch {
    throw new Error("Source URL is invalid.");
  }
  if (!id || !name) throw new Error("Source id and name are required.");
  if (!ALLOWED_SOURCE_PARSERS.has(parser)) throw new Error(`Unsupported source parser: ${parser}`);
  if (category && !EVENT_CATEGORIES.includes(category)) throw new Error(`Unsupported source category: ${category}`);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Source URL must use HTTP or HTTPS.");

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Source latitude and longitude are required.");
  }
  return { ...input, id, name, parser, category, url: url.toString(), latitude, longitude, enabled: input.enabled !== false };
}

export function isReusableSourceCandidate(candidate) {
  return candidate?.reusableSource !== false && candidate?.sourceScope !== "single-event";
}
