const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

function bestImage(images = []) {
  return [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
}

function normalizeTicketmasterEvent(event) {
  const venue = event._embedded?.venues?.[0] || {};
  const attraction = event._embedded?.attractions?.[0] || {};
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
    genres: [
      attraction.classifications?.[0]?.genre?.name,
      attraction.classifications?.[0]?.subGenre?.name,
    ].filter(Boolean),
    category: "music",
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

export async function fetchTicketmasterEvents({
  apiKey,
  lat,
  lng,
  radius = 25,
  startDate,
  endDate,
}) {
  const key = cleanApiKey(apiKey);
  if (!key) return [];

  const url = new URL(BASE_URL);
  url.searchParams.set("apikey", key);
  url.searchParams.set("classificationName", "music");
  url.searchParams.set("size", "200");
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("unit", "miles");

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    url.searchParams.set("latlong", `${lat},${lng}`);
  }

  if (startDate) {
    url.searchParams.set(
      "startDateTime",
      new Date(startDate).toISOString().replace(/\.\d{3}Z$/, "Z"),
    );
  }

  if (endDate) {
    url.searchParams.set(
      "endDateTime",
      new Date(endDate).toISOString().replace(/\.\d{3}Z$/, "Z"),
    );
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Ticketmaster returned ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Ticketmaster returned a response that was not valid JSON.");
  }

  return (body._embedded?.events || []).map(normalizeTicketmasterEvent);
}

export function ticketmasterKeyStatus(value) {
  const key = cleanApiKey(value);
  return {
    configured: Boolean(key),
    length: key.length,
    containsWhitespace: /\s/.test(String(value || "")),
  };
}
