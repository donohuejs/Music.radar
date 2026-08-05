const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function contributors(events) {
  return [...new Set(events.flatMap((event) =>
    String(event.sourceName || "Unknown source").split(" + ").map((name) => name.trim()).filter(Boolean),
  ))].sort();
}

export function buildSearchCoverageRecord({
  displayName,
  radiusMiles,
  category,
  startDate,
  endDate,
  events = [],
  discoveryCoverage = {},
  now = Date.now(),
}) {
  const sourceContributors = contributors(events);
  const localContributors = sourceContributors.filter(
    (name) => !["Ticketmaster", "Unknown source"].includes(name),
  );
  const cells = discoveryCoverage.cells || [];
  const completeCells = cells.filter((cell) => cell.status === "complete");
  const weakCells = completeCells.filter((cell) => Number(cell.registeredSourceCount || 0) === 0);
  const coverageState = events.length === 0
    ? "empty"
    : localContributors.length === 0
      ? "commercial-only"
      : "local-supported";

  return {
    searchedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RETENTION_MS).toISOString(),
    displayName: String(displayName || "Unknown area").slice(0, 160),
    radiusMiles: Number(radiusMiles),
    category,
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    returnedCount: events.length,
    sourceContributors,
    localContributorCount: localContributors.length,
    coverageState,
    blindSpot: coverageState !== "local-supported" || weakCells.length > 0,
    discoveryCellIds: cells.map((cell) => cell.id),
    discoveryCellCount: cells.length,
    completedDiscoveryCellCount: completeCells.length,
    pendingDiscoveryCellCount: cells.filter((cell) => cell.status === "pending").length,
    weakDiscoveryCellCount: weakCells.length,
  };
}

export async function recordSearchCoverage(db, input) {
  const record = buildSearchCoverageRecord(input);
  const reference = await db.collection("searchCoverage").add(record);
  try {
    const expired = await db
      .collection("searchCoverage")
      .where("expiresAt", "<=", new Date().toISOString())
      .limit(25)
      .get();
    if (!expired.empty) {
      const batch = db.batch();
      expired.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  } catch (error) {
    console.warn("Could not remove expired search coverage records:", error.message);
  }
  return { id: reference.id, ...record };
}
