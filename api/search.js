import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import {
  attachDistanceAndFilter,
  mergeAndDedupe,
} from "../lib/server/events.js";
import { geocodeLocation } from "../lib/server/geocode.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";
import { fetchTicketmasterEvents } from "../lib/server/ticketmaster.js";
import { EVENT_CATEGORIES } from "../lib/server/eventCategory.js";
import { searchGeoCells } from "../lib/server/geoCells.js";

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function settledSource(name, operation, fallback) {
  try {
    return {
      value: await operation(),
      health: { ok: true, error: null },
    };
  } catch (error) {
    const message = error?.message || `${name} failed`;
    console.warn(`${name} collector failed:`, message);
    return {
      value: fallback,
      health: { ok: false, error: message },
    };
  }
}

async function fetchStoredEvents({ startDate, endDate, lat, lng, radius }) {
  const db = getAdminDb();
  if (!db) return [];

  const cells = searchGeoCells(lat, lng, radius);
  if (cells.length === 0) return [];
  const snapshots = [];

  for (let index = 0; index < cells.length; index += 30) {
    snapshots.push(
      await db
        .collection("events")
        .where("geoCell", "in", cells.slice(index, index + 30))
        .where("startTime", ">=", startDate.toISOString())
        .where("startTime", "<=", endDate.toISOString())
        .orderBy("startTime", "asc")
        .limit(2000)
        .get(),
    );
  }

  const events = new Map();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      events.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }
  return [...events.values()];
}

async function resolveSearchLocation({ lat, lng, location }) {
  if (lat !== null && lng !== null) {
    return {
      latitude: lat,
      longitude: lng,
      displayName: location || "Current location",
      source: "browser",
    };
  }

  const geocoded = await geocodeLocation(location);
  return { ...geocoded, source: "geocoder" };
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
  const requestedLat = parseNumber(request.query.lat);
  const requestedLng = parseNumber(request.query.lng);
  const radius = Math.min(
    Math.max(parseNumber(request.query.radius) || 25, 1),
    100,
  );
  const location = String(request.query.location || "").trim();
  const requestedCategory = String(request.query.category || "all")
    .trim()
    .toLowerCase();
  const category =
    requestedCategory === "all" || EVENT_CATEGORIES.includes(requestedCategory)
      ? requestedCategory
      : "all";

  if ((requestedLat === null || requestedLng === null) && !location) {
    return response
      .status(400)
      .json({ error: "Provide coordinates or a city." });
  }

  try {
    const resolvedLocation = await resolveSearchLocation({
      lat: requestedLat,
      lng: requestedLng,
      location,
    });
    const lat = resolvedLocation.latitude;
    const lng = resolvedLocation.longitude;
    const indexedSearchEnabled =
      process.env.INDEXED_SEARCH_ENABLED === "true" && Boolean(getAdminDb());

    const [firestore, localVenues, ticketmaster] = await Promise.all([
      settledSource(
        "Firestore",
        () => fetchStoredEvents({ startDate, endDate, lat, lng, radius }),
        [],
      ),
      settledSource(
        "Local venues",
        () =>
          indexedSearchEnabled
            ? Promise.resolve({ events: [], sourceStatus: [] })
            : fetchLocalVenueEvents(),
        { events: [], sourceStatus: [] },
      ),
      process.env.TICKETMASTER_API_KEY
        ? settledSource(
            "Ticketmaster",
            () =>
              fetchTicketmasterEvents({
                apiKey: process.env.TICKETMASTER_API_KEY,
                lat,
                lng,
                radius,
                startDate,
                endDate,
              }),
            [],
          )
        : Promise.resolve({
            value: [],
            health: {
              ok: false,
              error: "TICKETMASTER_API_KEY is not configured.",
            },
          }),
    ]);

    const merged = mergeAndDedupe([
      ...firestore.value,
      ...localVenues.value.events,
      ...ticketmaster.value,
    ]);

    const filtered = attachDistanceAndFilter(merged, lat, lng, radius)
      .filter((event) => {
        const timestamp = new Date(event.startTime).getTime();
        return (
          Number.isFinite(timestamp) &&
          timestamp >= startDate.getTime() &&
          timestamp <= endDate.getTime()
        );
      })
      .filter((event) => category === "all" || event.category === category)
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() -
          new Date(b.startTime).getTime(),
      );

    return response.status(200).json({
      events: filtered,
      meta: {
        resolvedLocation: {
          latitude: lat,
          longitude: lng,
          displayName: resolvedLocation.displayName,
          source: resolvedLocation.source,
        },
        radiusMiles: radius,
        category,
        searchMode: indexedSearchEnabled ? "indexed" : "hybrid-live",
        storedCount: firestore.value.length,
        localVenueCount: localVenues.value.events.length,
        liveTicketmasterCount: ticketmaster.value.length,
        returnedCount: filtered.length,
        firebaseConfigured: Boolean(getAdminDb()),
        ticketmasterConfigured: Boolean(process.env.TICKETMASTER_API_KEY),
        localSources: localVenues.value.sourceStatus,
        sourceHealth: {
          firestore: firestore.health,
          localVenues: localVenues.health,
          ticketmaster: ticketmaster.health,
        },
      },
    });
  } catch (error) {
    console.error(error);

    const isLocationError =
      /could not find|location lookup|location service|enter a city/i.test(
        error.message || "",
      );

    return response.status(isLocationError ? 400 : 500).json({
      error: isLocationError
        ? error.message
        : "Music Radar could not complete the search.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}
