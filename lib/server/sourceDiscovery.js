import { isIP } from "node:net";

import { discoverEmbeddedCalendars } from "./embeddedCalendars.js";
import { absoluteUrl, decodeHtml, extractLinks, stripHtml } from "./htmlUtils.js";

const OVERPASS_URLS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const PAGE_SIGNALS = /\b(event|events|calendar|concert|concerts|music|festival|festivals|entertainment|lineup|schedule|what'?s on|live)\b/i;
const FREE_SIGNALS = /\b(free|no admission|no cover|complimentary|community)\b/i;
const MUNICIPAL_SIGNALS = /\b(city|county|town|village|municipal|government|parks|recreation|tourism|downtown)\b/i;
const POSTER_SIGNALS = /\b(lineup|schedule|poster|entertainment|music)\b/i;
const POSTER_ASSET = /(?:\.pdf|\.(?:png|jpe?g|webp))(?:$|\?)/i;
const PRIVATE_IPV4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

function safeUrl(value, baseUrl) {
  const normalized = absoluteUrl(value, baseUrl);
  if (!normalized) return null;

  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) return null;
  if (isIP(hostname) && (PRIVATE_IPV4.test(hostname) || hostname === "::1")) {
    return null;
  }
  url.hash = "";
  return url.toString();
}

async function fetchText(
  url,
  { timeoutMs = 12000, maxBytes = 2_000_000, deadline = Infinity } = {},
) {
  const safe = safeUrl(url);
  if (!safe) throw new Error("Discovery URL is not public HTTP(S).");
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Discovery time budget exhausted.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
  try {
    const response = await fetch(safe, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.2",
        "Accept-Language": "en-US,en;q=0.8",
        "User-Agent": "MusicRadarDiscovery/1.0 (+https://music-radar-one.vercel.app)",
      },
    });
    if (!response.ok) throw new Error(`${safe} returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw new Error(`${safe} is too large to inspect`);
    return (await response.text()).slice(0, maxBytes);
  } finally {
    clearTimeout(timeout);
  }
}

export function overpassQuery({ latitude, longitude, radiusMiles = 25 }) {
  const radiusMeters = Math.round(Math.min(Math.max(radiusMiles, 5), 50) * 1609.344);
  const around = `around:${radiusMeters},${Number(latitude)},${Number(longitude)}`;
  const venueAmenities = "bar|pub|biergarten|nightclub|theatre|arts_centre|community_centre|music_venue|concert_hall|events_venue";
  return `[out:json][timeout:25];(
    nwr(${around})["website"]["amenity"~"^(${venueAmenities})$"];
    nwr(${around})["contact:website"]["amenity"~"^(${venueAmenities})$"];
    nwr(${around})["website"]["music_venue"="yes"];
    nwr(${around})["contact:website"]["music_venue"="yes"];
    nwr(${around})["website"]["club"="music"];
    nwr(${around})["contact:website"]["club"="music"];
    nwr(${around})["website"]["craft"="brewery"];
    nwr(${around})["contact:website"]["craft"="brewery"];
    nwr(${around})["website"]["tourism"~"^(attraction|museum)$"];
    nwr(${around})["contact:website"]["tourism"~"^(attraction|museum)$"];
    nwr(${around})["website"]["leisure"~"^(park|garden)$"];
    nwr(${around})["contact:website"]["leisure"~"^(park|garden)$"];
    relation(${around})["website"]["boundary"="administrative"];
    relation(${around})["contact:website"]["boundary"="administrative"];
  );out center tags 500;`;
}

function elementCoordinates(element) {
  return {
    latitude: Number(element.lat ?? element.center?.lat),
    longitude: Number(element.lon ?? element.center?.lon),
  };
}

export function parseOverpassCandidates(payload) {
  const candidates = new Map();
  for (const element of payload?.elements || []) {
    const tags = element.tags || {};
    const url = safeUrl(tags.website || tags["contact:website"]);
    const { latitude, longitude } = elementCoordinates(element);
    if (!url || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const organizationType =
      tags.boundary === "administrative" ? "government" : "venue";
    const priority =
      tags.music_venue === "yes" || tags.club === "music" ? 4 :
        /^(music_venue|concert_hall|events_venue|nightclub)$/.test(tags.amenity || "") ? 3 :
          /^(theatre|arts_centre)$/.test(tags.amenity || "") ? 2 : 1;
    candidates.set(url, {
      name: tags.name || new URL(url).hostname,
      url,
      latitude,
      longitude,
      organizationType,
      discoveryMethod: "openstreetmap",
      osmType: element.type,
      osmId: element.id,
      priority,
    });
  }
  return [...candidates.values()].sort((first, second) => second.priority - first.priority);
}

export async function discoverNearbyOrganizations(location, { timeoutMs = 20000 } = {}) {
  const errors = [];
  const attemptTimeout = Math.max(Math.floor(timeoutMs / OVERPASS_URLS.length), 4000);
  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeout);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "MusicRadarDiscovery/1.0 (+https://music-radar-one.vercel.app)",
        },
        body: new URLSearchParams({ data: overpassQuery(location) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseOverpassCandidates(await response.json());
    } catch (error) {
      errors.push(`${new URL(url).hostname}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`OpenStreetMap discovery failed: ${errors.join("; ")}`);
}

function extractSitemapUrls(xml, baseUrl) {
  return [...String(xml).matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => safeUrl(decodeHtml(stripHtml(match[1])), baseUrl))
    .filter(Boolean);
}

export function detectPageSource(html, pageUrl) {
  const normalizedHtml = String(html)
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
  const calendars = discoverEmbeddedCalendars(normalizedHtml, pageUrl);
  if (calendars.length) {
    return {
      kind: "calendar",
      parser: "calendar-page",
      confidence: 0.98,
      detectedProvider: calendars[0].provider,
    };
  }

  if (/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?"@type"\s*:\s*(?:"[^"]*Event"|\[[^\]]*"[^"]*Event")/i.test(normalizedHtml)) {
    return { kind: "calendar", parser: "json-ld", confidence: 0.95 };
  }

  const feedLink = extractLinks(normalizedHtml, pageUrl, (url) => /\.(?:ics|rss|xml)(?:$|\?)/i.test(url))[0];
  if (feedLink) {
    return {
      kind: "calendar",
      parser: /\.ics(?:$|\?)/i.test(feedLink.url) ? "ical" : "rss",
      feedUrl: feedLink.url,
      confidence: 0.96,
    };
  }

  const detailLinks = eventDetailLinks(normalizedHtml, pageUrl);
  const listingPath = /^\/(?:events?|shows?|calendar|garcias-events)\/?$/i.test(
    new URL(pageUrl).pathname,
  );
  if (detailLinks.length >= (listingPath ? 3 : 8)) {
    return {
      kind: "calendar",
      parser: "json-ld-listing",
      confidence: 0.96,
      detectedProvider: "linked-event-pages",
      linkedEventCount: detailLinks.length,
    };
  }

  const posterLinks = extractLinks(normalizedHtml, pageUrl, (url) =>
    POSTER_ASSET.test(url) || /content\.civicplus\.com\/api\/assets\//i.test(url),
  );
  for (const match of normalizedHtml.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = safeUrl(match[1], pageUrl);
    const label = `${stripHtml(match[2])} ${match[2].match(/alt=["']([^"']+)["']/i)?.[1] || ""}`;
    if (
      url &&
      POSTER_SIGNALS.test(label) &&
      (POSTER_ASSET.test(url) || /content\.civicplus\.com\/api\/assets\//i.test(url))
    ) {
      posterLinks.push({ url, text: label });
    }
  }
  const posterLink = posterLinks.find((link) =>
    POSTER_SIGNALS.test(`${link.text} ${link.url}`),
  );
  if (posterLink) {
    return {
      kind: "poster",
      parser: null,
      assetUrl: posterLink.url,
      confidence: 0.86,
      requiresExtraction: true,
    };
  }

  return null;
}

export function eventDetailLinks(html, pageUrl) {
  const root = new URL(pageUrl);
  const page = new URL(pageUrl).toString();
  return [
    ...new Set(
      extractLinks(html, pageUrl, (url) => {
        const parsed = new URL(url);
        if (parsed.hostname !== root.hostname || parsed.toString() === page) return false;
        return /\/(?:event|events|calendar|shows|garcias-events)\/[a-z0-9][^/?#]*/i.test(
          parsed.pathname,
        );
      }).map((link) => link.url),
    ),
  ];
}

function pageScore({ title, text, organizationType, detection }) {
  let score = detection?.confidence || 0.35;
  if (PAGE_SIGNALS.test(`${title} ${text}`)) score += 0.18;
  if (FREE_SIGNALS.test(text)) score += 0.06;
  if (organizationType === "government" || MUNICIPAL_SIGNALS.test(text)) score += 0.05;
  return Math.min(score, 0.99);
}

function titleFromHtml(html, fallback) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(match?.[1] || fallback);
}

async function candidatePageUrls(
  organization,
  homepageHtml,
  { deadline = Infinity, maxPages = 12 } = {},
) {
  const root = new URL(organization.url);
  const links = extractLinks(homepageHtml, organization.url, (url) => {
    const parsed = new URL(url);
    return parsed.hostname === root.hostname && PAGE_SIGNALS.test(`${url}`);
  }).map((link) => link.url);

  try {
    const sitemap = await fetchText(new URL("/sitemap.xml", root).toString(), {
      maxBytes: 3_000_000,
      deadline,
    });
    links.push(
      ...extractSitemapUrls(sitemap, organization.url).filter((url) =>
        PAGE_SIGNALS.test(url),
      ),
    );
  } catch {
    // Many small venue websites do not publish a sitemap.
  }

  const unique = [...new Set([organization.url, ...links])];
  return unique
    .sort((first, second) => {
      const score = (url) =>
        /\/(?:events?|shows?|calendar)(?:\/|$)/i.test(new URL(url).pathname) ? 1 : 0;
      return score(second) - score(first);
    })
    .slice(0, maxPages);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker),
  );
  return results;
}

export async function inspectOrganization(
  organization,
  { deadline = Infinity, maxPages = 12 } = {},
) {
  const homepageHtml = await fetchText(organization.url, { deadline });
  const urls = await candidatePageUrls(organization, homepageHtml, { deadline, maxPages });
  const pageCandidates = await mapWithConcurrency(urls, 4, async (url) => {
    try {
      const html =
        url === organization.url ? homepageHtml : await fetchText(url, { deadline });
      const text = stripHtml(html).slice(0, 20_000);
      const title = titleFromHtml(html, organization.name);
      const detection = detectPageSource(html, url);
      if (!detection && !PAGE_SIGNALS.test(`${title} ${text}`)) return null;

      return {
        name: title || organization.name,
        url,
        organizationUrl: organization.url,
        organizationType: organization.organizationType,
        discoveryMethod: organization.discoveryMethod,
        latitude: organization.latitude,
        longitude: organization.longitude,
        status: detection?.kind === "poster" ? "needs-extraction" : "candidate",
        score: pageScore({ title, text, organizationType: organization.organizationType, detection }),
        freeEventSignal: FREE_SIGNALS.test(text),
        ...detection,
      };
    } catch {
      // A broken page should not prevent other candidates from being inspected.
      return null;
    }
  });
  const candidates = pageCandidates.filter(Boolean);

  const listings = candidates
    .filter((candidate) => candidate.parser === "json-ld-listing")
    .sort(
      (first, second) =>
        Number(second.linkedEventCount || 0) - Number(first.linkedEventCount || 0),
    );
  if (!listings.length) return candidates;

  const preferredListing = listings[0];
  return candidates.filter(
    (candidate) =>
      candidate === preferredListing ||
      !["json-ld", "json-ld-listing"].includes(candidate.parser),
  );
}

export async function discoverLocationSources(location, { maxOrganizations = 20 } = {}) {
  const batch = await discoverLocationSourceBatch(location, {
    maxOrganizations,
    deadline: Date.now() + 5 * 60 * 1000,
  });
  return batch.candidates;
}

export async function discoverLocationSourceBatch(
  location,
  {
    organizationOffset = 0,
    maxOrganizations = 2,
    deadline = Date.now() + 45000,
    organizations: suppliedOrganizations = null,
  } = {},
) {
  const organizations = Array.isArray(suppliedOrganizations) && suppliedOrganizations.length
    ? suppliedOrganizations
    : (await discoverNearbyOrganizations(location, {
        timeoutMs: Math.min(24000, Math.max(deadline - Date.now(), 1000)),
      })).slice(0, 20);
  const results = [];
  const selected = organizations.slice(
    organizationOffset,
    organizationOffset + maxOrganizations,
  );
  let processedOrganizations = 0;

  for (const organization of selected) {
    if (Date.now() >= deadline) break;
    try {
      results.push(...(await inspectOrganization(organization, { deadline })));
    } catch {
      // Discovery is intentionally best-effort and isolated per organization.
    }
    if (Date.now() >= deadline) break;
    processedOrganizations += 1;
  }

  const unique = new Map();
  for (const candidate of results) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.score > existing.score) unique.set(candidate.url, candidate);
  }
  const nextOffset = organizationOffset + processedOrganizations;
  return {
    candidates: [...unique.values()].sort((a, b) => b.score - a.score),
    organizationCount: organizations.length,
    processedOrganizations,
    nextOffset,
    complete: nextOffset >= organizations.length,
    organizations,
  };
}
