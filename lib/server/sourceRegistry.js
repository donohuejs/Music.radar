import { VENUE_SOURCES } from "./venueSources.js";

export async function loadEnabledSources(db) {
  if (!db) return VENUE_SOURCES;

  const snapshot = await db
    .collection("sources")
    .where("enabled", "==", true)
    .limit(250)
    .get();

  if (snapshot.empty) return VENUE_SOURCES;

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
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
    updatedAt: new Date().toISOString(),
  };
}

export function sourceHealthUpdate(source, status) {
  const successfulRuns = Number(source.successfulRuns || 0) + (status.ok ? 1 : 0);
  const failedRuns = Number(source.failedRuns || 0) + (status.ok ? 0 : 1);
  const consecutiveFailures = status.ok
    ? 0
    : Number(source.consecutiveFailures || 0) + 1;
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
    successfulRuns,
    failedRuns,
    consecutiveFailures,
    sourceConfidence: confidence,
    lifecycle,
    lastRunAt: new Date().toISOString(),
    lastRunOk: status.ok,
    lastRunEventCount: Number(status.eventCount || 0),
    lastError: status.error || null,
  };
}

export async function updateDiscoveredSourceHealth(db, sources, statuses) {
  const discovered = sources
    .map((source, index) => ({ source, status: statuses[index] }))
    .filter(({ source, status }) => source.discovered && status);
  if (!discovered.length) return;

  const references = discovered.map(({ source }) =>
    db.collection("sources").doc(source.id),
  );
  const snapshots = await db.getAll(...references);
  const batch = db.batch();
  discovered.forEach(({ source, status }, index) => {
    const current = snapshots[index].exists
      ? { ...source, ...snapshots[index].data() }
      : source;
    batch.set(references[index], sourceHealthUpdate(current, status), { merge: true });
  });
  await batch.commit();
}
