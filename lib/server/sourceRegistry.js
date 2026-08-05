import { VENUE_SOURCES } from "./venueSources.js";
import { FieldPath } from "firebase-admin/firestore";

const INGESTION_STATE_ID = "source-ingestion";
const DEFAULT_BATCH_SIZE = 4;

export async function loadEnabledSources(db) {
  if (!db) return VENUE_SOURCES;

  const snapshot = await db.collection("sources").get();
  const sources = new Map(
    VENUE_SOURCES.map((source) => [source.id, { ...source }]),
  );

  snapshot.docs.forEach((doc) => {
    const registered = normalizeRegisteredSource({ id: doc.id, ...doc.data() });
    sources.set(doc.id, {
      ...(sources.get(doc.id) || {}),
      ...registered,
    });
  });

  return [...sources.values()].filter((source) => source.enabled !== false);
}

export async function ensureDefaultSources(db) {
  const references = VENUE_SOURCES.map((source) =>
    db.collection("sources").doc(source.id),
  );
  const snapshots = await Promise.all(references.map((reference) => reference.get()));
  const batch = db.batch();
  let added = 0;

  VENUE_SOURCES.forEach((source, index) => {
    if (snapshots[index].exists) return;
    batch.set(
      references[index],
      sourceDocument(source),
    );
    added += 1;
  });

  if (!added) return false;
  await batch.commit();
  return true;
}

export function sourceDocument(source) {
  return {
    ...source,
    enabled: source.enabled !== false,
    nextIngestAt: source.nextIngestAt || new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function sourceIsDue(source, now = Date.now()) {
  if (source?.enabled === false) return false;
  if (!source?.nextIngestAt) return true;
  const timestamp = new Date(source.nextIngestAt).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function normalizeRegisteredSource(source) {
  if (source?.discovered && !source.categoryMode) {
    return { ...source, category: null, categoryMode: "mixed" };
  }
  return source;
}

export function sourceIngestionUpdate(source, status, now = Date.now()) {
  const successfulRuns = Number(source.successfulRuns || 0) + (status.ok ? 1 : 0);
  const failedRuns = Number(source.failedRuns || 0) + (status.ok ? 0 : 1);
  const consecutiveFailures = status.ok
    ? 0
    : Number(source.consecutiveFailures || 0) + 1;
  const successHours = status.notModified
    ? 24
    : Number(status.eventCount || 0) > 0
      ? 18
      : 72;
  const retryHours = Math.min(6 * 2 ** Math.max(consecutiveFailures - 1, 0), 168);
  const nextIngestAt = new Date(
    now + (status.ok ? successHours : retryHours) * 60 * 60 * 1000,
  ).toISOString();

  return {
    successfulRuns,
    failedRuns,
    consecutiveFailures,
    lastRunAt: new Date(now).toISOString(),
    lastRunOk: status.ok,
    lastRunEventCount: status.notModified
      ? Number(source.lastRunEventCount || 0)
      : Number(status.eventCount || 0),
    lastError: status.error || null,
    nextIngestAt,
    httpEtag: status.httpEtag || source.httpEtag || null,
    httpLastModified: status.httpLastModified || source.httpLastModified || null,
  };
}

export async function loadSourceIngestionBatch(
  db,
  { limit = DEFAULT_BATCH_SIZE, force = false, now = Date.now() } = {},
) {
  const batchSize = Math.min(Math.max(Number(limit) || DEFAULT_BATCH_SIZE, 1), 12);
  const stateReference = db.collection("operationalState").doc(INGESTION_STATE_ID);
  const stateSnapshot = await stateReference.get();
  const cursor = stateSnapshot.exists ? stateSnapshot.data()?.cursor : null;
  let query = db
    .collection("sources")
    .orderBy(FieldPath.documentId())
    .limit(batchSize);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const scanned = snapshot.docs.map((doc) =>
    normalizeRegisteredSource({ id: doc.id, ...doc.data() }),
  );
  const cycleComplete = scanned.length < batchSize;

  return {
    sources: scanned.filter((source) => force || sourceIsDue(source, now)),
    scannedCount: scanned.length,
    cursor: cycleComplete ? null : scanned.at(-1)?.id || null,
    cycleComplete,
  };
}

export async function saveSourceIngestionCursor(db, batch, now = Date.now()) {
  await db
    .collection("operationalState")
    .doc(INGESTION_STATE_ID)
    .set(
      {
        cursor: batch.cursor,
        cycleCompletedAt: batch.cycleComplete ? new Date(now).toISOString() : null,
        updatedAt: new Date(now).toISOString(),
      },
      { merge: true },
    );
}

export function sourceHealthUpdate(source, status) {
  const ingestion = sourceIngestionUpdate(source, status);
  const { successfulRuns, failedRuns, consecutiveFailures } = ingestion;
  const confidence = Math.min(
    0.99,
    Math.max(
      0,
      Number(source.discoveryConfidence || 0.9) +
        Math.min(successfulRuns, 5) * 0.01 -
        consecutiveFailures * 0.08,
    ),
  );
  const lifecycle =
    consecutiveFailures >= 3
      ? "degraded"
      : successfulRuns >= 3 && confidence >= 0.96
        ? "trusted"
        : "probation";

  return {
    ...ingestion,
    sourceConfidence: confidence,
    lifecycle,
  };
}

export async function updateSourceIngestionHealth(db, sources, statuses) {
  const updates = sources
    .map((source, index) => ({ source, status: statuses[index] }))
    .filter(({ status }) => status);
  if (!updates.length) return;

  const references = updates.map(({ source }) =>
    db.collection("sources").doc(source.id),
  );
  const snapshots = await db.getAll(...references);
  const batch = db.batch();
  updates.forEach(({ source, status }, index) => {
    const current = normalizeRegisteredSource(
      snapshots[index].exists
        ? { ...source, ...snapshots[index].data() }
        : source,
    );
    const update = current.discovered
      ? {
          ...sourceHealthUpdate(current, status),
          ...(current.categoryMode === "mixed"
            ? { category: null, categoryMode: "mixed" }
            : {}),
        }
      : sourceIngestionUpdate(current, status);
    batch.set(references[index], update, { merge: true });
  });
  await batch.commit();
}

export const updateDiscoveredSourceHealth = updateSourceIngestionHealth;
