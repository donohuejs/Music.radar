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
    sourceName: "Ticketmaster",
    sourceUrl: event.url || null,
    confidence: 0.98,
    lastVerifiedAt: new Date().toISOString(),
  };
}

export async function fetchTicketmasterEvents({
  apiKey,
  lat,
  lng,
  radius = 25,
  startDate,
  endDate,
  city,
}) {
  if (!apiKey) return [];

  const params = new URLSearchParams({
    apikey: apiKey,
    classificationName: "music",
    size: "200",
    sort: "date,asc",
    radius: String(radius),
    unit: "miles",
  });

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set("latlong", `${lat},${lng}`);
  } else if (city) {
    params.set("city", city.split(",")[0].trim());
  }

  if (startDate) params.set("startDateTime", new Date(startDate).toISOString().replace(/\.\d{3}Z$/, "Z"));
  if (endDate) params.set("endDateTime", new Date(endDate).toISOString().replace(/\.\d{3}Z$/, "Z"));

  const response = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Ticketmaster returned ${response.status}: ${details.slice(0, 180)}`);
  }

  const body = await response.json();
  return (body._embedded?.events || []).map(normalizeTicketmasterEvent);
}
