import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { filterSuppressedEvents, loadEventSuppressions } from "../lib/server/eventSuppressions.js";
import {
  attachDistanceAndFilter,
  mergeAndDedupe,
} from "../lib/server/events.js";
import { geocodeLocation, timeZoneForCoordinates } from "../lib/server/geocode.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";
import { fetchTicketmasterEvents } from "../lib/server/ticketmaster.js";
import { EVENT_CATEGORIES, inferEventCategory } from "../lib/server/eventCategory.js";
import { searchGeoCells } from "../lib/server/geoCells.js";
import { queueDiscoveryJobsForArea } from "../lib/server/discoveryStore.js";
import { recordSearchCoverage } from "../lib/server/searchCoverage.js";
import { applyDiscogsDisplayCompliance } from "../lib/server/discogsCompliance.js";
import { getZonedDateRange } from "../lib/server/zonedDateRange.js";

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function effectiveSearchStart(startDate, endDate, currentTime = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date(currentTime);

  if (end.getTime() >= now.getTime() && start.getTime() < now.getTime()) {
    return now;
  }
  return start;
}

export function resolveRequestedDateRange(query, timeZone, currentTime = new Date()) {
  const option = String(query.dateOption || "").trim().toLowerCase();
  if (["tonight", "tomorrow", "weekend", "week", "fortnight", "month", "custom"].includes(option)) {
    const range = getZonedDateRange(
      option,
      query.customStart,
      query.customEnd,
      timeZone,
      currentTime,
    );
    const endDate = new Date(range.endDate);
    return {
      dateOption: option,
      requestedStartDate: new Date(range.startDate),
      startDate: effectiveSearchStart(range.startDate, endDate, currentTime),
      endDate,
    };
  }

  const now = new Date(currentTime);
  const oneWeek = new Date(now);
  oneWeek.setDate(oneWeek.getDate() + 7);
  const requestedStartDate = validateDate(query.startDate, now);
  const endDate = validateDate(query.endDate, oneWeek);
  return {
    dateOption: null,
    requestedStartDate,
    startDate: effectiveSearchStart(requestedStartDate, endDate, now),
    endDate,
  };
}

export async function settledSource(name, operation, fallback, { timeoutMs = 15000 } = {}) {
  let timeout;
  try {
    return {
      value: await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`${name} timed out after ${timeoutMs}ms.`)),
            timeoutMs,
          );
        }),
      ]),
      health: { ok: true, error: null },
    };
  } catch (error) {
    const message = error?.message || `${name} failed`;
    console.warn(`${name} collector failed:`, message);
    return {
      value: fallback,
      health: { ok: false, error: message },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function initializeSearchDb(getDb = getAdminDb) {
  try {
    return { db: getDb(), error: null };
  } catch (error) {
    const message = error?.message || "Firebase Admin failed to initialize.";
    console.warn("Firebase Admin initialization failed:", message);
    return { db: null, error: message };
  }
}

async function fetchStoredEvents({ db, startDate, endDate, lat, lng, radius }) {
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
      events.set(doc.id, applyDiscogsDisplayCompliance({ id: doc.id, ...doc.data() }));
    }
  }
  return [...events.values()];
}

async function resolveSearchLocation({ lat, lng, location, coordinateSource }) {
  if (lat !== null && lng !== null) {
    return {
      latitude: lat,
      longitude: lng,
      timeZone: timeZoneForCoordinates(lat, lng),
      displayName: location || "Current location",
      source: coordinateSource === "geocoder" ? "geocoder" : "browser",
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
      coordinateSource: request.query.locationSource,
    });
    const lat = resolvedLocation.latitude;
    const lng = resolvedLocation.longitude;
    const { dateOption: resolvedDateOption, requestedStartDate, startDate, endDate } = resolveRequestedDateRange(
      request.query,
      resolvedLocation.timeZone,
      now,
    );
    const { db, error: firebaseInitializationError } = initializeSearchDb();
    const indexedSearchEnabled =
      process.env.INDEXED_SEARCH_ENABLED === "true" && Boolean(db);

    const [firestore, localVenues, ticketmaster, suppressions] = await Promise.all([
      settledSource(
        "Firestore",
        () => fetchStoredEvents({ db, startDate, endDate, lat, lng, radius }),
        [],
        { timeoutMs: 8000 },
      ),
      settledSource(
        "Local venues",
        () =>
          indexedSearchEnabled
            ? Promise.resolve({ events: [], sourceStatus: [] })
            : fetchLocalVenueEvents(),
        { events: [], sourceStatus: [] },
        { timeoutMs: 10000 },
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
                category,
              }),
            [],
            { timeoutMs: 15000 },
          )
        : Promise.resolve({
            value: [],
            health: {
              ok: false,
              error: "TICKETMASTER_API_KEY is not configured.",
            },
          }),
      settledSource(
        "Event suppressions",
        () => loadEventSuppressions(db),
        [],
        { timeoutMs: 5000 },
      ),
    ]);

    const merged = filterSuppressedEvents(mergeAndDedupe([
      ...firestore.value,
      ...localVenues.value.events,
      ...ticketmaster.value,
    ]), suppressions.value).map((event) => ({
      ...event,
      // Re-evaluate deterministic category overrides so corrected rules also
      // apply to cached events before the next ingestion refresh.
      category: inferEventCategory(event),
    }));

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

    let discoveryCoverage = { queuedCount: 0, coverageCellCount: 0, cells: [] };
    let coverageRecord = null;
    if (indexedSearchEnabled) {
      const discovery = await settledSource(
        "Source discovery queue",
        () => queueDiscoveryJobsForArea(db, {
          latitude: lat,
          longitude: lng,
          displayName: resolvedLocation.displayName,
          radiusMiles: radius,
        }),
        discoveryCoverage,
        { timeoutMs: 1500 },
      );
      discoveryCoverage = discovery.value;

      const coverage = await settledSource(
        "Search coverage record",
        () => recordSearchCoverage(db, {
          displayName: resolvedLocation.displayName,
          radiusMiles: radius,
          category,
          startDate,
          endDate,
          events: filtered,
          discoveryCoverage,
        }),
        null,
        { timeoutMs: 1500 },
      );
      coverageRecord = coverage.value;
    }

    return response.status(200).json({
      events: filtered,
      meta: {
        resolvedLocation: {
          latitude: lat,
          longitude: lng,
          displayName: resolvedLocation.displayName,
          source: resolvedLocation.source,
          timeZone: resolvedLocation.timeZone,
        },
        requestedStartDate: requestedStartDate.toISOString(),
        searchStartDate: startDate.toISOString(),
        searchEndDate: endDate.toISOString(),
        dateOption: resolvedDateOption,
        customStartDate: resolvedDateOption === "custom" ? request.query.customStart : null,
        customEndDate: resolvedDateOption === "custom" ? request.query.customEnd : null,
        radiusMiles: radius,
        category,
        searchMode: indexedSearchEnabled ? "indexed" : "hybrid-live",
        storedCount: firestore.value.length,
        localVenueCount: localVenues.value.events.length,
        liveTicketmasterCount: ticketmaster.value.length,
        ticketmasterRequestCount:
          ticketmaster.value.collectionStatus?.requestCount || 0,
        ticketmasterTruncated:
          ticketmaster.value.collectionStatus?.truncated === true,
        returnedCount: filtered.length,
        firebaseConfigured: Boolean(db),
        ticketmasterConfigured: Boolean(process.env.TICKETMASTER_API_KEY),
        discoveryQueued: discoveryCoverage.queuedCount > 0,
        discoveryQueuedCellCount: discoveryCoverage.queuedCount,
        discoveryCoverageCellCount: discoveryCoverage.coverageCellCount,
        coverageState: coverageRecord?.coverageState || null,
        localSources: localVenues.value.sourceStatus,
        sourceHealth: {
          firestore: firestore.health,
          firebaseAdmin: firebaseInitializationError
            ? { ok: false, error: firebaseInitializationError }
            : { ok: true, error: null },
          eventSuppressions: suppressions.health,
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
    const isDateError = /valid custom date range|valid current time/i.test(
      error.message || "",
    );

    return response.status(isLocationError || isDateError ? 400 : 500).json({
      error: isLocationError || isDateError
        ? error.message
        : "Music Radar could not complete the search.",
      detail:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}
