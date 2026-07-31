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
  const snapshot = await db.collection("sources").limit(1).get();
  if (!snapshot.empty) return false;

  const batch = db.batch();
  for (const source of VENUE_SOURCES) {
    batch.set(
      db.collection("sources").doc(source.id),
      sourceDocument(source),
      { merge: true },
    );
  }
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
