import { normalizeEvent } from "./cleanEvent.js";
import {
  artistCacheId,
  artistLookupKey,
  extractEventArtistNames,
} from "./eventArtists.js";
import { eventGeoCell } from "./geoCells.js";
import { filterSuppressedEvents, loadEventSuppressions } from "./eventSuppressions.js";

function documentId(event) {
  return String(event.id || `${event.sourceId}:${event.name}:${event.startTime}`)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 1400);
}

function needsGenreLookup(event) {
  return event.category === "music" && event.genres?.includes("Genre not listed");
}

function hasUsableGenres(event) {
  return Array.isArray(event?.genres) && event.genres.some((genre) => genre !== "Genre not listed");
}

async function loadExistingEvents(db, references) {
  if (typeof db.getAll !== "function" || !references.length) return new Map();
  const existing = new Map();
  for (let index = 0; index < references.length; index += 200) {
    const snapshots = await db.getAll(...references.slice(index, index + 200));
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) existing.set(snapshot.ref.path, snapshot.data());
    });
  }
  return existing;
}

export function genreLookupFields(event, existingEvent = null) {
  const artistNames = extractEventArtistNames(event);
  const artistLookupKeys = artistNames.map(artistLookupKey);
  if (!needsGenreLookup(event)) {
    return { artistNames, artistLookupKeys, genreStatus: "matched" };
  }
  if (hasUsableGenres(existingEvent)) {
    return {
      artistNames,
      artistLookupKeys,
      genreStatus: "matched",
      genres: existingEvent.genres,
    };
  }
  return {
    artistNames,
    artistLookupKeys,
    genreStatus: artistNames.length ? "pending" : "unavailable",
  };
}

export async function upsertEvents(db, events) {
  const suppressions = await loadEventSuppressions(db);
  const normalized = filterSuppressedEvents(events, suppressions)
    .map(normalizeEvent)
    .filter(Boolean)
    .map((event) => ({ event, ref: db.collection("events").doc(documentId(event)) }));
  const existing = await loadExistingEvents(db, normalized.map(({ ref }) => ref));
  const writer = db.bulkWriter();
  const queue = new Map();
  const indexedAt = new Date().toISOString();

  for (const { event, ref } of normalized) {
    const lookup = genreLookupFields(event, existing.get(ref.path));
    const storedEvent = {
      ...event,
      ...lookup,
      geoCell: eventGeoCell(event.latitude, event.longitude),
      indexedAt,
    };

    writer.set(
      ref,
      storedEvent,
      { merge: true },
    );

    if (needsGenreLookup(event)) {
      lookup.artistNames.forEach((artistName) => {
        const id = artistCacheId(artistName);
        const current = queue.get(id);
        if (!current || event.startTime < current.priorityStartTime) {
          queue.set(id, {
            artistName,
            artistLookupKey: artistLookupKey(artistName),
            priorityStartTime: event.startTime,
          });
        }
      });
    }
  }

  for (const [id, candidate] of queue) {
    writer.set(db.collection("genreEnrichmentQueue").doc(id), {
      ...candidate,
      availableAt: indexedAt,
      lastSeenAt: indexedAt,
    }, { merge: true });
  }

  await writer.close();
  return normalized.length;
}

export async function recordIngestionRun(db, run) {
  await db.collection("ingestionRuns").add({
    ...run,
    completedAt: new Date().toISOString(),
  });
}
