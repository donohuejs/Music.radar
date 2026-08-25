import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import {
  enrichArtistGenres,
  genreCacheIsFresh,
  genreProviderConfiguration,
} from "../lib/server/artistGenreEnrichment.js";
import {
  artistCacheId,
  artistLookupKey,
  extractEventArtistNames,
} from "../lib/server/eventArtists.js";
import { FieldPath } from "firebase-admin/firestore";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(
    supplied &&
      (supplied === process.env.CRON_SECRET || supplied === process.env.INGEST_SECRET),
  );
}

export function genreEnrichmentPageSize(limit) {
  return Math.min(Math.max(Number(limit) || 4, 1), 8);
}

export function genreEnrichmentScanState({
  snapshotSize,
  pageSize,
  errors = 0,
  backfillComplete = true,
}) {
  const scanComplete = snapshotSize < pageSize && errors === 0 && backfillComplete;
  return {
    scanComplete,
    // Retain the field for callers deployed before the artist queue migration.
    nextCursor: scanComplete ? null : "artist-queue",
  };
}

export function genreQueueCandidates(events = [], now = new Date().toISOString()) {
  const candidates = new Map();
  const eventUpdates = [];

  events.forEach((entry) => {
    const event = entry.data || entry;
    if (
      event.category !== "music" ||
      !event.genres?.includes("Genre not listed") ||
      String(event.startTime || "") < now ||
      event.genreStatus === "unavailable"
    ) return;

    const artistNames = extractEventArtistNames(event);
    const artistLookupKeys = artistNames.map(artistLookupKey);
    eventUpdates.push({ entry, artistNames, artistLookupKeys });
    artistNames.forEach((artistName) => {
      const id = artistCacheId(artistName);
      const candidate = candidates.get(id);
      if (!candidate || event.startTime < candidate.priorityStartTime) {
        candidates.set(id, {
          id,
          artistName,
          artistLookupKey: artistLookupKey(artistName),
          priorityStartTime: event.startTime,
          availableAt: now,
          lastSeenAt: now,
        });
      }
    });
  });

  return { candidates: [...candidates.values()], eventUpdates };
}

async function seedUpcomingQueue(db, now) {
  const stateRef = db.collection("operationalState").doc("genreEnrichmentBackfill");
  const stateSnapshot = await stateRef.get();
  const state = stateSnapshot.exists ? stateSnapshot.data() : {};
  if (state.completedAt) {
    return { queuedArtists: 0, scannedEvents: 0, backfillComplete: true };
  }

  let query = db
    .collection("events")
    .where("genres", "array-contains", "Genre not listed")
    .orderBy(FieldPath.documentId())
    .limit(500);
  if (state.lastDocumentId) query = query.startAfter(state.lastDocumentId);
  const snapshot = await query.get();
  const { candidates, eventUpdates } = genreQueueCandidates(
    snapshot.docs.map((document) => ({ document, data: document.data() })),
    now,
  );

  const writer = db.bulkWriter();
  eventUpdates.forEach(({ entry, artistNames, artistLookupKeys }) => {
    writer.set(entry.document.ref, {
      artistNames,
      artistLookupKeys,
      genreStatus: artistNames.length ? "pending" : "unavailable",
    }, { merge: true });
  });
  candidates.forEach(({ id, ...candidate }) => {
    writer.set(db.collection("genreEnrichmentQueue").doc(id), candidate, { merge: true });
  });
  const backfillComplete = snapshot.size < 500;
  writer.set(stateRef, {
    lastDocumentId: snapshot.docs.at(-1)?.id || state.lastDocumentId || null,
    scannedEvents: Number(state.scannedEvents || 0) + snapshot.size,
    updatedAt: now,
    completedAt: backfillComplete ? now : null,
  }, { merge: true });
  await writer.close();
  return { queuedArtists: candidates.length, scannedEvents: snapshot.size, backfillComplete };
}

async function loadQueueBatch(db, pageSize, now) {
  const load = () => db
    .collection("genreEnrichmentQueue")
    .where("availableAt", "<=", now)
    .orderBy("availableAt", "asc")
    .limit(100)
    .get();
  let snapshot = await load();
  let seeded = { queuedArtists: 0, scannedEvents: 0, backfillComplete: false };
  if (snapshot.size < pageSize) {
    seeded = await seedUpcomingQueue(db, now);
    if (seeded.queuedArtists) snapshot = await load();
  }
  return {
    documents: [...snapshot.docs]
      .sort((first, second) =>
        String(first.data().priorityStartTime || "").localeCompare(
          String(second.data().priorityStartTime || ""),
        ),
      )
      .slice(0, pageSize),
    seeded,
  };
}

function enrichmentUpdate(genres, enrichment) {
  const discogsEvidence = enrichment.evidence?.find(
    (item) => item.provider === "discogs" && item.status === "matched" && item.sourceUrl,
  );
  return {
    genres,
    genreStatus: "matched",
    genreEnrichment: {
      provider: enrichment.provider || "musicbrainz",
      providerArtistId: enrichment.providerArtistId || enrichment.mbid || null,
      mbid: enrichment.mbid || null,
      confidence: enrichment.confidence || null,
      discogsAttribution: discogsEvidence ? {
        sourceUrl: discogsEvidence.sourceUrl,
        observedAt: discogsEvidence.observedAt || new Date().toISOString(),
      } : null,
      enrichedAt: new Date().toISOString(),
    },
  };
}

async function affectedEvents(db, lookupKey) {
  return db
    .collection("events")
    .where("artistLookupKeys", "array-contains", lookupKey)
    .limit(500)
    .get();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  if (!authorized(request)) return response.status(401).json({ error: "Unauthorized." });

  const db = getAdminDb();
  if (!db) return response.status(503).json({ error: "Firebase Admin is not configured." });

  const pageSize = genreEnrichmentPageSize(request.body?.limit);
  const now = new Date().toISOString();
  try {
    const { documents, seeded } = await loadQueueBatch(db, pageSize, now);
    const writer = db.bulkWriter();
    const providerConfiguration = genreProviderConfiguration();
    const eventUpdates = new Map();
    let checked = 0;
    let processed = 0;
    let matched = 0;
    let updatedEvents = 0;
    let cacheHits = 0;
    const errors = [];

    for (const document of documents) {
      const job = document.data();
      const artistName = job.artistName;
      const lookupKey = job.artistLookupKey || artistLookupKey(artistName);
      const cacheRef = db.collection("artistGenreCache").doc(artistCacheId(artistName));
      const cacheSnapshot = await cacheRef.get();
      let enrichment = cacheSnapshot.exists ? cacheSnapshot.data() : null;
      let lookedUp = false;

      if (genreCacheIsFresh(enrichment, Date.now(), providerConfiguration)) {
        cacheHits += 1;
      } else {
        checked += 1;
        lookedUp = true;
        try {
          enrichment = await enrichArtistGenres(artistName);
          writer.set(cacheRef, {
            ...enrichment,
            queryArtistName: artistName,
            providerConfiguration,
            checkedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          errors.push({ artistName, error: error.message, retryable: Boolean(error.retryable) });
          writer.set(document.ref, {
            availableAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            lastError: error.message,
            lastAttemptAt: new Date().toISOString(),
          }, { merge: true });
          continue;
        }
      }

      const affected = await affectedEvents(db, lookupKey);
      affected.docs.forEach((eventDocument) => {
        const event = eventDocument.data();
        const current = eventUpdates.get(eventDocument.ref.path) || {
          ref: eventDocument.ref,
          genres: (event.genres || []).filter((genre) => genre !== "Genre not listed"),
          status: event.genreStatus,
          enrichment: null,
        };
        if (enrichment?.status === "matched" && enrichment.genres?.length) {
          current.genres = [...new Set([...current.genres, ...enrichment.genres])].slice(0, 5);
          current.status = "matched";
          current.enrichment = enrichment;
        } else if (current.status !== "matched" && !current.genres.length) {
          current.status = "unavailable";
        }
        eventUpdates.set(eventDocument.ref.path, current);
      });

      writer.set(cacheRef, { affectedEventCount: affected.size }, { merge: true });
      writer.delete(document.ref);
      processed += 1;
      if (enrichment?.status === "matched" && enrichment.genres?.length) matched += 1;
      if (lookedUp) await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    eventUpdates.forEach((update) => {
      if (update.status === "matched" && update.enrichment) {
        writer.set(update.ref, enrichmentUpdate(update.genres, update.enrichment), { merge: true });
        updatedEvents += 1;
      } else if (update.status === "unavailable") {
        writer.set(update.ref, { genreStatus: "unavailable" }, { merge: true });
      }
    });

    await writer.close();
    const { scanComplete, nextCursor } = genreEnrichmentScanState({
      snapshotSize: documents.length,
      pageSize,
      errors: errors.length,
      backfillComplete: seeded.backfillComplete,
    });
    return response.status(200).json({
      ok: true,
      candidateArtists: documents.length,
      processedArtists: processed,
      musicBrainzLookups: checked,
      cacheHits,
      matchedArtists: matched,
      updatedEvents,
      queuedBackfillArtists: seeded.queuedArtists,
      scannedBackfillEvents: seeded.scannedEvents,
      scanComplete,
      nextCursor,
      errors,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error.message });
  }
}
