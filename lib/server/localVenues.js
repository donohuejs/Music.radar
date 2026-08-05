import { fetchICalendarEvents, fetchRssEvents } from "./calendarFeeds.js";
import { fetchEmbeddedCalendarEvents } from "./embeddedCalendars.js";
import { fetchVenueEvents } from "./jsonLdEvents.js";
import { fetchCustomVenueEvents } from "./venueParsers.js";
import {
  fetchFoundryEvents,
  fetchPeaceCenterEvents,
} from "./venueSpecific.js";
import { VENUE_SOURCES } from "./venueSources.js";
import { parseSeriesSchedule } from "./seriesSchedules.js";

async function collectSource(source) {
  if (source.parser === "series-schedule") {
    return parseSeriesSchedule(source);
  }

  if (source.parser === "ical") {
    return fetchICalendarEvents(source);
  }

  if (source.parser === "rss") {
    return fetchRssEvents(source);
  }

  if (source.parser === "calendar-page") {
    return fetchEmbeddedCalendarEvents(source);
  }

  if (source.parser === "peace-center") {
    return fetchPeaceCenterEvents(source);
  }

  if (source.parser === "foundry") {
    return fetchFoundryEvents(source);
  }

  if (source.parser === "radio-room" || source.parser === "squarespace") {
    return fetchCustomVenueEvents(source);
  }

  return fetchVenueEvents(source);
}

async function collectWithConcurrency(sources, concurrency) {
  const results = new Array(sources.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < sources.length) {
      const index = nextIndex++;
      try {
        results[index] = {
          status: "fulfilled",
          value: await collectSource(sources[index]),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), sources.length) },
      worker,
    ),
  );
  return results;
}

export async function fetchLocalVenueEvents({
  sources = VENUE_SOURCES,
  concurrency = 6,
} = {}) {
  const results = await collectWithConcurrency(sources, concurrency);

  const events = [];
  const sourceStatus = [];

  results.forEach((result, index) => {
    const source = sources[index];

    if (result.status === "fulfilled") {
      events.push(
        ...result.value.map((event) => ({
          ...event,
          sourceId: event.sourceId || source.id,
        })),
      );
      sourceStatus.push({
        id: source.id,
        name: source.name,
        parser: source.parser,
        eventCount: result.value.collectionStatus?.notModified
          ? Number(source.lastRunEventCount || 0)
          : result.value.length,
        ok: true,
        notModified: result.value.collectionStatus?.notModified === true,
        httpEtag: result.value.collectionStatus?.httpEtag || null,
        httpLastModified:
          result.value.collectionStatus?.httpLastModified || null,
      });
      return;
    }

    console.warn(`Venue collector failed: ${source.name}`, result.reason);

    sourceStatus.push({
      id: source.id,
      name: source.name,
      parser: source.parser,
      eventCount: 0,
      ok: false,
      error: result.reason?.message || "Collector failed",
    });
  });

  return { events, sourceStatus };
}
