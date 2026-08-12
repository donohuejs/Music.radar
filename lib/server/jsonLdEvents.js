import { isEventDetailPath } from "./eventLinks.js";

function cleanText(value) {
  if (typeof value !== "string") return value || null;

  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  if (!value) return null;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = pattern.exec(html))) {
    const raw = match[1].trim();
    if (!raw) continue;

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // One malformed JSON-LD block should not break the whole collector.
    }
  }

  return blocks;
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== "object") return [];

  const items = [value];
  if (Array.isArray(value["@graph"])) {
    items.push(...value["@graph"].flatMap(flattenJsonLd));
  }

  return items;
}

function typeIncludesEvent(value) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((type) =>
    String(type || "").toLowerCase().endsWith("event"),
  );
}

function getLocation(event, source) {
  const location = Array.isArray(event.location)
    ? event.location[0]
    : event.location || {};

  const address =
    typeof location.address === "string"
      ? { streetAddress: location.address }
      : location.address || {};

  const geo = location.geo || {};

  return {
    venueName: cleanText(location.name) || source.name,
    address: cleanText(address.streetAddress),
    city: cleanText(address.addressLocality) || source.city,
    state: cleanText(address.addressRegion) || source.state,
    postalCode: cleanText(address.postalCode),
    latitude: Number.isFinite(Number(geo.latitude))
      ? Number(geo.latitude)
      : source.latitude,
    longitude: Number.isFinite(Number(geo.longitude))
      ? Number(geo.longitude)
      : source.longitude,
  };
}

function getImage(event, baseUrl) {
  const image = Array.isArray(event.image) ? event.image[0] : event.image;
  if (typeof image === "string") return absoluteUrl(image, baseUrl);
  if (image?.url) return absoluteUrl(image.url, baseUrl);
  return null;
}

function getTicketUrl(event, baseUrl) {
  const offer = Array.isArray(event.offers) ? event.offers[0] : event.offers;
  return absoluteUrl(offer?.url || event.url, baseUrl);
}

function normalizeJsonLdEvent(event, source) {
  const name = cleanText(event.name);
  const startTime = event.startDate ? new Date(event.startDate) : null;

  if (!name || !startTime || Number.isNaN(startTime.getTime())) {
    return null;
  }

  const location = getLocation(event, source);
  const ticketUrl = getTicketUrl(event, source.url);
  const sourceKey = `${source.id}:${name}:${startTime.toISOString()}`;

  return {
    id: sourceKey
      .toLowerCase()
      .replace(/[^a-z0-9:]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    externalId: null,
    name,
    artistName: name,
    ...location,
    startTime: startTime.toISOString(),
    endTime:
      event.endDate && !Number.isNaN(new Date(event.endDate).getTime())
        ? new Date(event.endDate).toISOString()
        : null,
    ticketUrl,
    imageUrl: getImage(event, source.url),
    category: source.category || null,
    genres: [],
    sourceName: source.name,
    // Preserve the page that described the event separately from its ticket URL.
    // This lets an operator suppress a bad event-detail page even when its offer
    // points to a third-party ticketing provider.
    sourceUrl: source.url,
    confidence: 0.9,
    lastVerifiedAt: new Date().toISOString(),
  };
}

export function parseJsonLdEvents(html, source) {
  return extractJsonLdBlocks(html)
    .flatMap(flattenJsonLd)
    .filter((item) => typeIncludesEvent(item["@type"]))
    .map((item) => normalizeJsonLdEvent(item, source))
    .filter(Boolean);
}

function linkedEventUrls(html, pageUrl) {
  const root = new URL(pageUrl);
  const urls = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const url = absoluteUrl(match[1], pageUrl);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname !== root.hostname || parsed.toString() === pageUrl) continue;
    if (!isEventDetailPath(parsed.pathname)) continue;
    urls.push(parsed.toString());
  }
  return [...new Set(urls)];
}

async function fetchHtml(source, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MusicRadar/1.0 (+https://music-radar-one.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLinkedJsonLdEvents(source, listingHtml, timeoutMs) {
  const urls = linkedEventUrls(listingHtml, source.url).slice(
    0,
    Math.min(Math.max(Number(source.maxDetailPages) || 80, 1), 120),
  );
  const events = [...parseJsonLdEvents(listingHtml, source)];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < urls.length) {
      const url = urls[nextIndex++];
      try {
        const detailHtml = await fetchHtml(source, url, timeoutMs);
        events.push(
          ...parseJsonLdEvents(detailHtml, { ...source, url }).map((event) => ({
            ...event,
            sourceUrl: url,
          })),
        );
      } catch (error) {
        console.warn(`Event detail failed: ${url}`, error.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  const unique = new Map();
  for (const event of events) {
    unique.set(`${event.name}|${event.startTime}|${event.venueName}`, event);
  }
  return [...unique.values()];
}

export async function fetchVenueEvents(source, { timeoutMs = 7000 } = {}) {
  const html = await fetchHtml(source, source.url, timeoutMs);
  return source.parser === "json-ld-listing"
    ? fetchLinkedJsonLdEvents(source, html, timeoutMs)
    : parseJsonLdEvents(html, source);
}
