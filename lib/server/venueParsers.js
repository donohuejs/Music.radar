import {
  absoluteUrl,
  extractLinks,
  extractMeta,
  fetchHtml,
  firstMatch,
  stripHtml,
} from "./htmlUtils.js";
import { parseJsonLdEvents } from "./jsonLdEvents.js";
import { eventDetailUrl } from "./eventLinks.js";
import { sourceTimeZone, zonedLocalIso } from "./eventTime.js";

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const WEEKDAYS =
  "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferYear(monthName, day, explicitYear) {
  if (explicitYear) return Number(explicitYear);

  const now = new Date();
  const candidate = new Date(`${monthName} ${day}, ${now.getFullYear()} 12:00:00`);

  // Event calendars often omit the year. If that date is far in the past,
  // it almost certainly refers to the next calendar year.
  if (candidate.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 60) {
    return now.getFullYear() + 1;
  }

  return now.getFullYear();
}

function parseClock(value) {
  if (!value) return { hours: 19, minutes: 0 };

  const match = value
    .trim()
    .toLowerCase()
    .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);

  if (!match) return { hours: 19, minutes: 0 };

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);

  if (match[3] === "pm" && hours !== 12) hours += 12;
  if (match[3] === "am" && hours === 12) hours = 0;

  return { hours, minutes };
}

export function easternIso(monthName, day, year, clockValue) {
  return venueLocalIso(monthName, day, year, clockValue, "America/New_York");
}

export function venueLocalIso(monthName, day, year, clockValue, timeZone) {
  const { hours, minutes } = parseClock(clockValue);
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
  const pad = (value) => String(value).padStart(2, "0");
  return zonedLocalIso(`${year}-${pad(monthIndex + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`, timeZone);
}

function extractDate(html) {
  const text = stripHtml(html);
  const fullDate = text.match(
    new RegExp(
      `(?:${WEEKDAYS}),?\\s+(${MONTHS})\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?`,
      "i",
    ),
  );

  if (fullDate) {
    return {
      month: fullDate[1],
      day: fullDate[2],
      year: inferYear(fullDate[1], fullDate[2], fullDate[3]),
    };
  }

  const monthFirst = text.match(
    new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2}),\\s*(\\d{4})\\b`, "i"),
  );

  if (!monthFirst) return null;

  return {
    month: monthFirst[1],
    day: monthFirst[2],
    year: Number(monthFirst[3]),
  };
}

function extractShowTime(html) {
  const text = stripHtml(html);

  return (
    text.match(/(?:show|performance|starts?)\s*:\s*(\d{1,2}(?::\d{2})?\s*[ap]m)/i)?.[1] ||
    text.match(/\b(\d{1,2}(?::\d{2})?\s*[ap]m)\b/i)?.[1] ||
    null
  );
}

function extractTitle(html) {
  return (
    extractMeta(html, "og:title") ||
    firstMatch(html, [
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
      /<title\b[^>]*>([\s\S]*?)<\/title>/i,
    ])
  )
    ?.replace(/\s+[–|-]\s+Radio Room Greenville$/i, "")
    ?.replace(/\s+[–|-]\s+Swanson'?s Warehouse$/i, "")
    ?.trim();
}

function extractTicketUrl(html, pageUrl) {
  const links = extractLinks(html, pageUrl, (url) =>
    /etix\.com|eventbrite\.com|prekindle\.com|ticketmaster\.com|axs\.com/i.test(url),
  );

  return links[0]?.url || pageUrl;
}

function extractImage(html, pageUrl) {
  return absoluteUrl(
    extractMeta(html, "og:image") || extractMeta(html, "twitter:image"),
    pageUrl,
  );
}

export function normalizeDetailPage(html, source, pageUrl) {
  // Squarespace's event article excludes footer promotions and related events.
  const article = html.match(/<article\b[^>]*class=["'][^"']*\beventitem\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const content = article?.match(/<div\b[^>]*class=["']eventitem-column-content["'][^>]*>([\s\S]*)/i)?.[1];
  const description = content ? stripHtml(content).slice(0, 8000) : null;
  const jsonLdEvents = parseJsonLdEvents(html, { ...source, url: pageUrl });
  if (jsonLdEvents.length > 0) {
    return jsonLdEvents.map((event) => ({
      ...event,
      description: event.description || (jsonLdEvents.length === 1 ? description : null),
      sourceUrl: pageUrl,
      ticketUrl: event.ticketUrl || extractTicketUrl(html, pageUrl),
    }));
  }

  if (source.parser === "squarespace" && !article) return [];
  const eventHtml = article || html;
  const dateTimeHtml = article?.match(/<ul\b[^>]*class=["'][^"']*\bevent-meta-date-time-container\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || eventHtml;
  const title = extractTitle(eventHtml);
  const date = extractDate(dateTimeHtml);

  if (!title || !date) return [];

  const clock = extractShowTime(dateTimeHtml);
  // A dynamic calendar must provide an actual time and timezone; no invented
  // 7 PM/Eastern default. Keep the historic dedicated Radio Room fallback.
  if (!clock && source.parser !== "radio-room") return [];
  const startTime = venueLocalIso(
    date.month,
    date.day,
    date.year,
    clock,
    sourceTimeZone(source),
  );
  if (!startTime) return [];

  return [
    {
      id: `${source.id}:${slugify(title)}:${startTime}`,
      externalId: null,
      name: title,
      description,
      artistName: title,
      venueName: source.name,
      address: source.address || null,
      city: source.city,
      state: source.state,
      postalCode: source.postalCode || null,
      latitude: source.latitude,
      longitude: source.longitude,
      startTime,
      endTime: null,
      ticketUrl: extractTicketUrl(html, pageUrl),
      imageUrl: extractImage(html, pageUrl),
      genres: [],
      category: source.category || (source.parser === "radio-room" ? "music" : null),
      sourceName: source.name,
      sourceUrl: pageUrl,
      confidence: 0.92,
      lastVerifiedAt: new Date().toISOString(),
    },
  ];
}

function isLikelyEventDetail(url, source) {
  if (source.parser === "radio-room") {
    return url.startsWith("https://radioroomgreenville.com/event/");
  }

  if (source.parser === "squarespace") {
    return Boolean(eventDetailUrl(url, source.url));
  }

  return false;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      try {
        results.push(await mapper(current));
      } catch (error) {
        console.warn(`Event detail failed: ${current}`, error.message);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}

export async function fetchCustomVenueEvents(source) {
  // Preserve legacy manually registered venue calendars. Newly discovered and
  // explicitly mixed community sources must classify each event on evidence.
  source = {
    ...source,
    category: source.category || (!source.discovered && source.categoryMode !== "mixed" ? "music" : null),
  };
  const listingHtml = await fetchHtml(source.url);
  const listingJsonLd = parseJsonLdEvents(listingHtml, source);

  const detailUrls = [
    ...new Set(
      extractLinks(listingHtml, source.url, (url) =>
        isLikelyEventDetail(url, source),
      ).map((link) => eventDetailUrl(link.url, source.url) || link.url),
    ),
  ].slice(0, source.maxDetailPages || 60);

  if (detailUrls.length === 0) {
    return listingJsonLd;
  }

  const detailResults = await mapWithConcurrency(
    detailUrls,
    6,
    async (url) => normalizeDetailPage(await fetchHtml(url), source, url),
  );

  const events = [...listingJsonLd, ...detailResults.flat()];
  const unique = new Map();

  for (const event of events) {
    unique.set(`${event.name}|${event.startTime}|${event.venueName}`, event);
  }

  return [...unique.values()];
}
