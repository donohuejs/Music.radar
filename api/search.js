import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import {
  attachDistanceAndFilter,
  mergeAndDedupe,
} from "../lib/server/events.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";
import { fetchTicketmasterEvents } from "../lib/server/ticketmaster.js";

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function fetchStoredEvents({ startDate, endDate }) {
  const db = getAdminDb();
  if (!db) return [];

  const snapshot = await db
    .collection("events")
    .where("startTime", ">=", startDate.toISOString())
    .where("startTime", "<=", endDate.toISOString())
    .orderBy("startTime", "asc")
    .limit(1000)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const now = new Date();
  const oneWeek = new Date(now);
  oneWeek.setDate(oneWeek.getDate() + 7);

  const startDate = validateDate(request.query.startDate, now);
  const endDate = validateDate(request.query.endDate, oneWeek);
  const lat = parseNumber(request.query.lat);
  const lng = parseNumber(request.query.lng);
  const radius = Math.min(
    Math.max(parseNumber(request.query.radius) || 25, 1),
    100,
  );
  const location = String(request.query.location || "").trim();

  if ((lat === null || lng === null) && !location) {
    return response
      .status(400)
      .json({ error: "Provide coordinates or a city." });
  }

  try {
    const ticketmasterPromise = process.env.TICKETMASTER_API_KEY
      ? fetchTicketmasterEvents({
          apiKey: process.env.TICKETMASTER_API_KEY,
          lat,
          lng,
          radius,
          startDate,
          endDate,
          city: location,
        }).catch((error) => {
          console.warn("Ticketmaster collector failed:", error.message);
          return [];
        })
      : Promise.resolve([]);

    const [storedEvents, localResult, ticketmasterEvents] = await Promise.all([
      fetchStoredEvents({ startDate, endDate }),
      fetchLocalVenueEvents(),
      ticketmasterPromise,
    ]);

    const merged = mergeAndDedupe([
      ...storedEvents,
      ...localResult.events,
      ...ticketmasterEvents,
    ]);

    const filtered = attachDistanceAndFilter(merged, lat, lng, radius)
      .filter((event) => {
        const eventDate = new Date(event.startTime);
        return eventDate >= startDate && eventDate <= endDate;
      })
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() -
          new Date(b.startTime).getTime(),
      );

    return response.status(200).json({
      events: filtered,
      meta: {
        storedCount: storedEvents.length,
        localVenueCount: localResult.events.length,
        liveTicketmasterCount: ticketmasterEvents.length,
        returnedCount: filtered.length,
        firebaseConfigured: Boolean(getAdminDb()),
        ticketmasterConfigured: Boolean(process.env.TICKETMASTER_API_KEY),
        localSources: localResult.sourceStatus,
      },
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error: "Music Radar could not complete the search.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}
