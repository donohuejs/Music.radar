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
