import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { FieldPath } from "firebase-admin/firestore";
import {
  artistCacheId,
  enrichArtistGenres,
  genreCacheIsFresh,
  genreProviderConfiguration,
  normalizeArtistName,
} from "../lib/server/artistGenreEnrichment.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(
    supplied &&
      (supplied === process.env.CRON_SECRET || supplied === process.env.INGEST_SECRET),
  );
}

async function updateEvents(writer, documents, genres, enrichment) {
  const discogsEvidence = enrichment.evidence?.find(
    (item) => item.provider === "discogs" && item.status === "matched" && item.sourceUrl,
  );
  for (const document of documents) {
    writer.set(document.ref, {
      genres,
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
    }, { merge: true });
  }
}

export function genreEnrichmentPageSize(limit) {
  return Math.min(Math.max(Number(limit) || 4, 1), 8);
}

export function genreEnrichmentScanState({
  cursor,
  lastDocumentId,
  pageExhausted,
  pageSize,
  snapshotSize,
}) {
  return {
    scanComplete: pageExhausted && snapshotSize < pageSize,
    nextCursor:
      pageExhausted && snapshotSize === pageSize
        ? lastDocumentId
        : cursor || null,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  if (!authorized(request)) {
    return response.status(401).json({ error: "Unauthorized." });
  }

  const db = getAdminDb();
  if (!db) {
    return response.status(503).json({ error: "Firebase Admin is not configured." });
  }

  const limit = Math.min(Math.max(Number(request.body?.limit) || 4, 1), 8);
  const cursor = typeof request.body?.cursor === "string" && request.body.cursor.length <= 1500
    ? request.body.cursor
    : "";
  try {
    // Keep the document page no larger than the external lookup budget. This
    // guarantees a successful page can advance its cursor without skipping
    // artists or repeatedly reading a large, partially processed page.
    const pageSize = genreEnrichmentPageSize(limit);
    let query = db
      .collection("events")
      .where("genres", "array-contains", "Genre not listed")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    const groups = new Map();
    snapshot.docs.forEach((document) => {
      const event = document.data();
      if (event.category !== "music") return;
      const artistName = normalizeArtistName(event.artistName || event.name);
      if (!artistName) return;
      const key = artistName.toLowerCase();
      const group = groups.get(key) || { artistName, documents: [] };
      group.documents.push(document);
      groups.set(key, group);
    });

    const writer = db.bulkWriter();
    const providerConfiguration = genreProviderConfiguration();
    let checked = 0;
    let processed = 0;
    let matched = 0;
    let updatedEvents = 0;
    let cacheHits = 0;
    let pageExhausted = true;
    const errors = [];

    for (const group of groups.values()) {
      const cacheRef = db.collection("artistGenreCache").doc(artistCacheId(group.artistName));
      const cacheSnapshot = await cacheRef.get();
      let enrichment = cacheSnapshot.exists ? cacheSnapshot.data() : null;
      if (genreCacheIsFresh(enrichment, Date.now(), providerConfiguration)) {
        cacheHits += 1;
        writer.set(cacheRef, { affectedEventCount: group.documents.length }, { merge: true });
        if (enrichment.status !== "matched" || !enrichment.genres?.length) {
          continue;
        }
      } else {
        if (checked >= limit) {
          pageExhausted = false;
          break;
        }
        checked += 1;
        try {
          enrichment = await enrichArtistGenres(group.artistName);
        } catch (error) {
          errors.push({
            artistName: group.artistName,
            error: error.message,
            retryable: Boolean(error.retryable),
          });
          pageExhausted = false;
          await new Promise((resolve) => setTimeout(resolve, 1100));
          continue;
        }
        writer.set(cacheRef, {
          ...enrichment,
          queryArtistName: group.artistName,
          affectedEventCount: group.documents.length,
          providerConfiguration,
          checkedAt: new Date().toISOString(),
        }, { merge: true });
      }

      if (enrichment.status === "matched" && enrichment.genres?.length) {
        await updateEvents(writer, group.documents, enrichment.genres, enrichment);
        matched += 1;
        updatedEvents += group.documents.length;
      }
      processed += 1;

      // Search calls also count against MusicBrainz's shared one-per-second limit.
      if (checked) await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    await writer.close();
    const lastDocumentId = snapshot.docs.at(-1)?.id || null;
    const { scanComplete, nextCursor } = genreEnrichmentScanState({
      cursor,
      lastDocumentId,
      pageExhausted,
      pageSize,
      snapshotSize: snapshot.size,
    });
    return response.status(200).json({
      ok: true,
      candidateArtists: groups.size,
      processedArtists: processed,
      musicBrainzLookups: checked,
      cacheHits,
      matchedArtists: matched,
      updatedEvents,
      scanComplete,
      nextCursor,
      errors,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error.message });
  }
}
