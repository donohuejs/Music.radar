const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const PAGE_SIZE = 200;
const MAX_DEEP_PAGES = 5;
const MAX_REQUESTS = 12;
const MAX_SPLIT_DEPTH = 5;

function bestImage(images = []) {
  return [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
}

export function ticketmasterCategory(event) {
  const classifications = [
    ...(event.classifications || []),
    ...(event._embedded?.attractions || []).flatMap(
      (attraction) => attraction.classifications || [],
    ),
  ];
  const text = classifications
    .flatMap((classification) => [
      classification.segment?.name,
      classification.genre?.name,
      classification.subGenre?.name,
      classification.type?.name,
      classification.subType?.name,
    ])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(comedy|comedian|stand[- ]?up|improv)\b/.test(text)) return "comedy";
  if (/\b(arts?\s*&\s*theatre|theat(?:re|er)|broadway|musical|opera|ballet|dance)\b/.test(text)) {
    return "theater";
  }
  if (/\bmusic\b/.test(text)) return "music";
  return "other";
}

export function ticketmasterClassifications(category = "music") {
  if (category === "all") return ["music", "arts & theatre"];
  if (category === "theater") return ["arts & theatre"];
  if (category === "comedy") return ["comedy"];
  if (category === "music") return ["music"];
  return [];
}

function normalizeTicketmasterEvent(event) {
  const venue = event._embedded?.venues?.[0] || {};
  const attraction = event._embedded?.attractions?.[0] || {};
  const classification = attraction.classifications?.[0] || event.classifications?.[0] || {};
  const localDate = event.dates?.start?.localDate;
  const localTime = event.dates?.start?.localTime || "19:00:00";
  const startTime = event.dates?.start?.dateTime || (localDate ? `${localDate}T${localTime}` : null);

  return {
    id: `ticketmaster:${event.id}`,
    externalId: event.id,
    name: event.name,
    artistName: attraction.name || event.name,
    venueName: venue.name || null,
    address: venue.address?.line1 || null,
    city: venue.city?.name || null,
    state: venue.state?.stateCode || null,
    postalCode: venue.postalCode || null,
    latitude: Number(venue.location?.latitude),
    longitude: Number(venue.location?.longitude),
    startTime,
    endTime: null,
    ticketUrl: event.url || null,
    imageUrl: bestImage(event.images),
    genres: [classification.genre?.name, classification.subGenre?.name].filter(Boolean),
    category: ticketmasterCategory(event),
    sourceName: "Ticketmaster",
    sourceUrl: event.url || null,
    confidence: 0.98,
    lastVerifiedAt: new Date().toISOString(),
  };
}

function cleanApiKey(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/[\r\n\t ]+/g, "");
}

function ticketmasterUrl({ key, classification, lat, lng, radius, startDate, endDate, page }) {
  const url = new URL(BASE_URL);
  url.searchParams.set("apikey", key);
  url.searchParams.set("classificationName", classification);
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("unit", "miles");
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    url.searchParams.set("latlong", `${lat},${lng}`);
  }
  if (startDate) {
    url.searchParams.set("startDateTime", new Date(startDate).toISOString().replace(/\.\d{3}Z$/, "Z"));
  }
  if (endDate) {
    url.searchParams.set("endDateTime", new Date(endDate).toISOString().replace(/\.\d{3}Z$/, "Z"));
  }
  return url;
}

async function fetchPage(parameters, page, budget) {
  if (budget.remaining <= 0) {
    budget.truncated = true;
    return null;
  }
  budget.remaining -= 1;
  budget.requestCount += 1;
  const url = ticketmasterUrl({ ...parameters, page });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ticketmaster returned ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Ticketmaster returned a response that was not valid JSON.");
  }
}

async function fetchWindow(parameters, budget, depth = 0) {
  const first = await fetchPage(parameters, 0, budget);
  if (!first) return [];
  const totalElements = Number(first.page?.totalElements || 0);
  const start = new Date(parameters.startDate).getTime();
  const end = new Date(parameters.endDate).getTime();
  if (
    totalElements > PAGE_SIZE * MAX_DEEP_PAGES &&
    depth < MAX_SPLIT_DEPTH &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end - start > 24 * 60 * 60 * 1000 &&
    budget.remaining >= 2
  ) {
    const midpoint = new Date(start + Math.floor((end - start) / 2));
    const left = await fetchWindow({ ...parameters, endDate: midpoint }, budget, depth + 1);
    const right = await fetchWindow({ ...parameters, startDate: midpoint }, budget, depth + 1);
    return [...left, ...right];
  }

  const events = [...(first._embedded?.events || [])];
  const totalPages = Math.min(Number(first.page?.totalPages || 1), MAX_DEEP_PAGES);
  for (let page = 1; page < totalPages; page += 1) {
    const body = await fetchPage(parameters, page, budget);
    if (!body) break;
    events.push(...(body._embedded?.events || []));
  }
  if (totalElements > PAGE_SIZE * MAX_DEEP_PAGES) budget.truncated = true;
  return events;
}

export async function fetchTicketmasterEvents({
  apiKey,
  lat,
  lng,
  radius = 25,
  startDate,
  endDate,
  category = "music",
}) {
  const key = cleanApiKey(apiKey);
  if (!key) return [];
  const classifications = ticketmasterClassifications(category);
  if (!classifications.length) return [];

  const budget = { remaining: MAX_REQUESTS, requestCount: 0, truncated: false };
  const rawEvents = [];
  const errors = [];
  for (const classification of classifications) {
    try {
      rawEvents.push(
        ...(await fetchWindow(
          { key, classification, lat, lng, radius, startDate, endDate },
          budget,
        )),
      );
    } catch (error) {
      errors.push(`${classification}: ${error.message}`);
    }
  }
  if (errors.length === classifications.length) {
    throw new Error(`Ticketmaster queries failed: ${errors.join("; ")}`);
  }

  const unique = new Map();
  for (const event of rawEvents) unique.set(event.id, normalizeTicketmasterEvent(event));
  const events = [...unique.values()];
  events.collectionStatus = {
    requestCount: budget.requestCount,
    truncated: budget.truncated,
    errors,
  };
  return events;
}

export function ticketmasterKeyStatus(value) {
  const key = cleanApiKey(value);
  return {
    configured: Boolean(key),
    length: key.length,
    containsWhitespace: /\s/.test(String(value || "")),
  };
}
