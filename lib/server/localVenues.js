import { fetchVenueEvents } from "./jsonLdEvents.js";
import { fetchCustomVenueEvents } from "./venueParsers.js";
import { VENUE_SOURCES } from "./venueSources.js";

async function collectSource(source) {
  if (source.parser === "radio-room" || source.parser === "squarespace") {
    return fetchCustomVenueEvents(source);
  }

  return fetchVenueEvents(source);
}

export async function fetchLocalVenueEvents() {
  const results = await Promise.allSettled(
    VENUE_SOURCES.map((source) => collectSource(source)),
  );

  const events = [];
  const sourceStatus = [];

  results.forEach((result, index) => {
    const source = VENUE_SOURCES[index];

    if (result.status === "fulfilled") {
      events.push(...result.value);
      sourceStatus.push({
        id: source.id,
        name: source.name,
        parser: source.parser,
        eventCount: result.value.length,
        ok: true,
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
