import {
  absoluteUrl,
  extractLinks,
  extractMeta,
  fetchHtml,
  firstMatch,
  stripHtml,
} from "./htmlUtils.js";
import { easternIso, slugify } from "./venueParsers.js";

const MONTH_PATTERN =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

function eventRecord({
  source,
  name,
  venueName,
  startTime,
  ticketUrl,
  sourceUrl,
  imageUrl,
  externalId = null,
}) {
  return {
    id: `${source.id}:${externalId || slugify(name)}:${startTime}`,
    externalId,
    name,
    artistName: name,
    venueName: venueName || source.name,
    address: source.address || null,
    city: source.city,
    state: source.state,
    postalCode: source.postalCode || null,
    latitude: source.latitude,
    longitude: source.longitude,
    startTime,
    endTime: null,
    ticketUrl: ticketUrl || sourceUrl,
    imageUrl: imageUrl || null,
    genres: [],
    sourceName: source.name,
    sourceUrl: sourceUrl || source.url,
    confidence: 0.94,
    lastVerifiedAt: new Date().toISOString(),
  };
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
        console.warn(`Venue detail failed: ${current}`, error.message);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}

function parsePeaceCenterDetail(html, source, pageUrl) {
  const name = stripHtml(
    firstMatch(html, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i]) ||
      extractMeta(html, "og:title"),
  )
    ?.replace(/\s*[|–—-]\s*Peace Center.*$/i, "")
    .trim();
  if (!name) return [];

  const imageUrl = absoluteUrl(extractMeta(html, "og:image"), pageUrl);
  const venueName =
    stripHtml(
      firstMatch(html, [
        /sidebar_event_venue[\s\S]*?<span>\s*(?:<a\b[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*<\/span>/i,
      ]),
    ) || source.name;
  const performances = new Map();
  const pattern = new RegExp(
    `href=["']([^"']*\\/events\\/ical\\/[^"']+)["'][^>]*title=["']Add to Calendar for (${MONTH_PATTERN})\\s+(\\d{1,2})\\s+(\\d{4})\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*[AP]M)["']`,
    "gi",
  );

  let match;
  while ((match = pattern.exec(html))) {
    const [, calendarUrl, month, day, year, time] = match;
    const startTime = easternIso(month, day, Number(year), time);
    const nearby = html.slice(match.index, match.index + 3500);
    const ticketUrl =
      firstMatch(nearby, [
        /<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*tickets/i,
      ]) || pageUrl;

    performances.set(
      startTime,
      eventRecord({
        source,
        name,
        venueName,
        startTime,
        ticketUrl: absoluteUrl(ticketUrl, pageUrl),
        sourceUrl: pageUrl,
        imageUrl,
        externalId: calendarUrl.split("/").pop(),
      }),
    );
  }

  return [...performances.values()];
}

export async function fetchPeaceCenterEvents(source) {
  const listingHtml = await fetchHtml(source.url);
  const detailUrls = [
    ...new Set(
      extractLinks(
        listingHtml,
        source.url,
        (url) =>
          new URL(url).hostname === new URL(source.url).hostname &&
          /\/events\/detail\//i.test(new URL(url).pathname),
      ).map(({ url }) => url),
    ),
  ].slice(0, source.maxDetailPages || 60);

  const detailResults = await mapWithConcurrency(
    detailUrls,
    6,
    async (url) => parsePeaceCenterDetail(await fetchHtml(url), source, url),
  );

  return detailResults.flat();
}

function extractFoundryBlocks(html) {
  const starts = [...html.matchAll(/<div class="pp-content-post\s/gi)].map(
    (match) => match.index,
  );

  return starts.map((start, index) =>
    html.slice(start, starts[index + 1] || html.length),
  );
}

export async function fetchFoundryEvents(source) {
  const html = await fetchHtml(source.url);

  return extractFoundryBlocks(html)
    .map((block) => {
      const name = stripHtml(
        firstMatch(block, [
          /<h3\b[^>]*class=["'][^"']*pp-content-grid-post-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i,
        ]),
      );
      const dateText = stripHtml(
        firstMatch(block, [
          /<span\b[^>]*class=["']showdate["'][^>]*>([\s\S]*?)<\/span>/i,
        ]),
      );
      const time = stripHtml(
        firstMatch(block, [
          /<span\b[^>]*class=["']showstart["'][^>]*>([\s\S]*?)<\/span>/i,
        ]),
      );
      const date = dateText?.match(
        new RegExp(
          `(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s+(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(\\d{4})`,
          "i",
        ),
      );

      if (!name || !date) return null;

      const sourceUrl = firstMatch(block, [
        /itemid=["']([^"']*\/shows\/[^"']+)["']/i,
      ]);
      const ticketUrl = firstMatch(block, [
        /<a\b[^>]*class=["'][^"']*ticket-btn[^"']*["'][^>]*href=["']([^"']+)["']/i,
        /<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*ticket-btn/i,
      ]);
      const imageUrl = firstMatch(block, [
        /<img\b[^>]*src=["']([^"']+)["']/i,
      ]);
      const startTime = easternIso(date[1], date[2], Number(date[3]), time);

      return eventRecord({
        source,
        name,
        startTime,
        ticketUrl: absoluteUrl(ticketUrl, source.url),
        sourceUrl: absoluteUrl(sourceUrl, source.url),
        imageUrl: absoluteUrl(imageUrl, source.url),
      });
    })
    .filter(Boolean);
}
