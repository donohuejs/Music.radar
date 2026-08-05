import { EVENT_CATEGORIES } from "./eventCategory.js";
import { localDateTime } from "./seriesSchedules.js";

function text(value, field, max = 160) {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  if (!result) throw new Error(`${field} is required.`);
  return result.slice(0, max);
}

function optionalText(value, max = 200) {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, max) : null;
}

export function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function buildPublishedPosterEvent(candidate, draft, input, now = Date.now()) {
  if (!candidate || !draft) throw new Error("Poster candidate and draft are required.");
  if (draft.status === "published") throw new Error("This poster draft is already published.");
  if (draft.status === "dismissed") throw new Error("This poster draft was dismissed.");

  const name = text(input.name, "Event name", 140);
  const localDate = String(input.localDate || "");
  const localTime = String(input.localTime || "");
  const timeZone = String(input.timeZone || "").trim();
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(localDate)) throw new Error("A valid event date is required.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error("A valid 24-hour event time is required.");
  if (!validTimeZone(timeZone)) throw new Error("A valid IANA time zone is required.");
  const start = localDateTime(localDate, localTime, timeZone);
  if (!Number.isFinite(start.getTime())) throw new Error("The event date and time are invalid.");
  if (start.getTime() < now - 24 * 60 * 60 * 1000) throw new Error("Past poster events cannot be published.");

  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Candidate coordinates are required before publication.");
  }
  const category = String(input.category || "music").toLowerCase();
  if (!EVENT_CATEGORIES.includes(category)) throw new Error("A valid event category is required.");

  return {
    id: `poster:${candidate.id}:${draft.id}`,
    externalId: `poster:${candidate.id}:${draft.id}`,
    name,
    artistName: name,
    venueName: text(input.venueName || candidate.name, "Venue name", 160),
    address: optionalText(input.address),
    city: optionalText(input.city, 100),
    state: optionalText(input.state, 80),
    postalCode: optionalText(input.postalCode, 20),
    latitude,
    longitude,
    startTime: start.toISOString(),
    endTime: null,
    ticketUrl: candidate.url || candidate.assetUrl || null,
    imageUrl: /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(candidate.assetUrl || "") ? candidate.assetUrl : null,
    genres: [],
    category,
    sourceName: candidate.name || "Reviewed poster",
    sourceUrl: candidate.url || candidate.assetUrl || null,
    sourceId: `poster:${candidate.id}`,
    confidence: 0.9,
    posterCandidateId: candidate.id,
    posterDraftId: draft.id,
    reviewedAt: new Date(now).toISOString(),
    lastVerifiedAt: new Date(now).toISOString(),
  };
}
