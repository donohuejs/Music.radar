import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import {
  artistCacheId,
  lookupArtistGenres,
  normalizeArtistName,
} from "../lib/server/musicBrainz.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(
    supplied &&
      (supplied === process.env.CRON_SECRET || supplied === process.env.INGEST_SECRET),
  );
}

function cacheIsFresh(cache) {
  const checkedAt = new Date(cache?.checkedAt).getTime();
  const maxAge = cache?.status === "matched" ? 180 : 30;
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < maxAge * 24 * 60 * 60 * 1000;
}

async function updateEvents(writer, documents, genres, enrichment) {
  for (const document of documents) {
    writer.set(document.ref, {
      genres,
      genreEnrichment: {
        provider: "musicbrainz",
        mbid: enrichment.mbid || null,
        confidence: enrichment.confidence || null,
        enrichedAt: new Date().toISOString(),
      },
    }, { merge: true });
  }
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
  try {
    const snapshot = await db
      .collection("events")
      .where("genres", "array-contains", "Genre not listed")
      .limit(250)
      .get();
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
    let checked = 0;
    let processed = 0;
    let matched = 0;
    let updatedEvents = 0;
    let cacheHits = 0;

    for (const group of groups.values()) {
      const cacheRef = db.collection("artistGenreCache").doc(artistCacheId(group.artistName));
      const cacheSnapshot = await cacheRef.get();
      let enrichment = cacheSnapshot.exists ? cacheSnapshot.data() : null;
      if (cacheIsFresh(enrichment)) {
        cacheHits += 1;
        if (enrichment.status !== "matched" || !enrichment.genres?.length) {
          continue;
        }
      } else {
        if (checked >= limit) break;
        enrichment = await lookupArtistGenres(group.artistName);
        checked += 1;
        writer.set(cacheRef, {
          ...enrichment,
          queryArtistName: group.artistName,
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
    return response.status(200).json({
      ok: true,
      candidateArtists: groups.size,
      processedArtists: processed,
      musicBrainzLookups: checked,
      cacheHits,
      matchedArtists: matched,
      updatedEvents,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error.message });
  }
}
