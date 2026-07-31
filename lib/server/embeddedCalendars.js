import { absoluteUrl, decodeHtml, fetchHtml } from "./htmlUtils.js";
import { parseICalendar } from "./calendarFeeds.js";

const TOCKIFY_HOSTS = new Set(["tockify.com", "www.tockify.com"]);
const RESERVED_TOCKIFY_PATHS = new Set(["api", "i", "login", "signup"]);

function calendarIdFromTockifyUrl(value, baseUrl) {
  const normalized = absoluteUrl(decodeHtml(value), baseUrl);
  if (!normalized) return null;

  let url;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (!TOCKIFY_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  const feedIndex = segments.findIndex(
    (segment, index) =>
      segment.toLowerCase() === "ics" &&
      segments[index - 1]?.toLowerCase() === "feeds",
  );
  const candidate = feedIndex >= 0 ? segments[feedIndex + 1] : segments[0];
  if (!candidate || RESERVED_TOCKIFY_PATHS.has(candidate.toLowerCase())) {
    return null;
  }

  return candidate.replace(/\.ics$/i, "");
}

export function discoverEmbeddedCalendars(html, pageUrl) {
  const calendars = new Map();
  const registerTockify = (calendarId) => {
    const normalizedId = String(calendarId || "").trim().replace(/\.ics$/i, "");
    if (!normalizedId || !/^[a-z0-9._-]+$/i.test(normalizedId)) return;

    const url = `https://tockify.com/api/feeds/ics/${encodeURIComponent(normalizedId)}`;
    calendars.set(`tockify:${normalizedId}`, {
      provider: "tockify",
      calendarId: normalizedId,
      parser: "ical",
      url,
    });
  };

  for (const match of String(html).matchAll(
    /data-tockify-calendar\s*=\s*["']([^"']+)["']/gi,
  )) {
    registerTockify(decodeHtml(match[1]));
  }

  const attributes = [
    ...String(html).matchAll(
      /<(?:iframe|a|link|script)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi,
    ),
  ];

  for (const match of attributes) {
    const calendarId = calendarIdFromTockifyUrl(match[1], pageUrl);
    if (!calendarId) continue;
    registerTockify(calendarId);
  }

  return [...calendars.values()];
}

export async function fetchEmbeddedCalendarEvents(source) {
  const html = await fetchHtml(source.url);
  const calendars = discoverEmbeddedCalendars(html, source.url);
  if (!calendars.length) {
    throw new Error(`No supported embedded calendar found at ${source.url}`);
  }

  const results = await Promise.allSettled(
    calendars.map(async (calendar) => {
      const text = await fetchHtml(calendar.url);
      return parseICalendar(text, {
        ...source,
        url: calendar.url,
      });
    }),
  );
  const events = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (!events.length && results.every((result) => result.status === "rejected")) {
    throw results.find((result) => result.status === "rejected").reason;
  }

  return events;
}
