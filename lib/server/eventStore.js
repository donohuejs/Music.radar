import { normalizeEvent } from "./cleanEvent.js";
import { eventGeoCell } from "./geoCells.js";
import { filterSuppressedEvents, loadEventSuppressions } from "./eventSuppressions.js";

function documentId(event) {
  return String(event.id || `${event.sourceId}:${event.name}:${event.startTime}`)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 1400);
}

export async function upsertEvents(db, events) {
  const writer = db.bulkWriter();
  let imported = 0;
  const suppressions = await loadEventSuppressions(db);

  for (const rawEvent of filterSuppressedEvents(events, suppressions)) {
    const event = normalizeEvent(rawEvent);
    if (!event) continue;

    const ref = db.collection("events").doc(documentId(event));
    writer.set(
      ref,
      {
        ...event,
        geoCell: eventGeoCell(event.latitude, event.longitude),
        indexedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    imported += 1;
  }

  await writer.close();
  return imported;
}

export async function recordIngestionRun(db, run) {
  await db.collection("ingestionRuns").add({
    ...run,
    completedAt: new Date().toISOString(),
  });
}
