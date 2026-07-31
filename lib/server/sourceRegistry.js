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

export function sourceDocument(source) {
  return {
    ...source,
    enabled: source.enabled !== false,
    updatedAt: new Date().toISOString(),
  };
}
