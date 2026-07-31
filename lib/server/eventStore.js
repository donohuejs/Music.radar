import { normalizeEvent } from "./cleanEvent.js";
import { eventGeoCell } from "./geoCells.js";

function documentId(event) {
  return String(event.id || `${event.sourceId}:${event.name}:${event.startTime}`)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 1400);
}

export async function upsertEvents(db, events) {
  const writer = db.bulkWriter();
  let imported = 0;

  for (const rawEvent of events) {
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
