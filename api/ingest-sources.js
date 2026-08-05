import { upsertEvents, recordIngestionRun } from "../lib/server/eventStore.js";
import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";
import {
  ensureDefaultSources,
  loadSourceIngestionBatch,
  saveSourceIngestionCursor,
  updateSourceIngestionHealth,
} from "../lib/server/sourceRegistry.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(
    supplied &&
      (supplied === process.env.CRON_SECRET ||
        supplied === process.env.INGEST_SECRET),
  );
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!authorized(request)) {
    return response.status(401).json({ error: "Unauthorized." });
  }

  const db = getAdminDb();
  if (!db) {
    return response.status(503).json({ error: "Firebase Admin is not configured." });
  }

  const startedAt = new Date().toISOString();

  try {
    const registryBootstrapped = await ensureDefaultSources(db);
    const batch = await loadSourceIngestionBatch(db, {
      limit: Number(request.body?.limit || request.query?.limit) || 4,
      force: request.body?.force === true || request.query?.force === "true",
    });
    const sources = batch.sources;
    const result = await fetchLocalVenueEvents({ sources });
    const imported = await upsertEvents(db, result.events);
    await updateSourceIngestionHealth(db, sources, result.sourceStatus);
    await saveSourceIngestionCursor(db, batch);

    await recordIngestionRun(db, {
      source: "registered-sources",
      status: "success",
      startedAt,
      sourceCount: sources.length,
      scannedSourceCount: batch.scannedCount,
      cycleComplete: batch.cycleComplete,
      imported,
      registryBootstrapped,
      sourceStatus: result.sourceStatus,
    });

    return response.status(200).json({
      ok: true,
      sourceCount: sources.length,
      scannedSourceCount: batch.scannedCount,
      cycleComplete: batch.cycleComplete,
      imported,
      registryBootstrapped,
      sourceStatus: result.sourceStatus,
    });
  } catch (error) {
    console.error(error);
    await recordIngestionRun(db, {
      source: "registered-sources",
      status: "failed",
      startedAt,
      error: error.message,
    });
    return response.status(500).json({ error: error.message });
  }
}
