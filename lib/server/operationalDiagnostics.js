const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(field) {
  return (first, second) => timestamp(second[field]) - timestamp(first[field]);
}

export function buildOperationalDiagnostics(
  { sources = [], jobs = [], candidates = [], runs = [], audits = [], searches = [] },
  now = Date.now(),
) {
  const sourceRows = sources
    .map((source) => {
      const lastRunAt = timestamp(source.lastRunAt);
      const stale = !lastRunAt || now - lastRunAt > 7 * DAY_MS;
      const due = !source.nextIngestAt || timestamp(source.nextIngestAt) <= now;
      const degraded =
        source.lifecycle === "degraded" ||
        source.lastRunOk === false ||
        Number(source.consecutiveFailures || 0) >= 3;
      return { ...source, stale, due, degraded };
    })
    .sort((first, second) =>
      Number(second.degraded) - Number(first.degraded) ||
      Number(second.stale) - Number(first.stale) ||
      String(first.name || first.id).localeCompare(String(second.name || second.id)),
    );

  const discoveryRows = jobs
    .map((job) => ({
      ...job,
      leaseExpired:
        job.status === "running" &&
        (!job.leaseExpiresAt || timestamp(job.leaseExpiresAt) <= now),
    }))
    .sort(newestFirst("updatedAt"));

  const sourceByUrl = new Map(
    sourceRows.filter((source) => source.url).map((source) => [String(source.url), source.id]),
  );
  const reviewCandidates = candidates
    .filter((candidate) =>
      ["discovered", "validated-candidate", "needs-extraction"].includes(
        candidate.status || candidate.lifecycle,
      ),
    )
    .map((candidate) => ({
      ...candidate,
      duplicateSourceId:
        sourceByUrl.get(String(candidate.feedUrl || candidate.url || "")) || null,
    }))
    .sort(
      (first, second) =>
        Number(second.score || 0) - Number(first.score || 0) ||
        timestamp(second.lastDiscoveredAt) - timestamp(first.lastDiscoveredAt),
    );

  const recentRuns = [...runs].sort(newestFirst("completedAt"));
  const failedRuns = recentRuns.filter((run) => run.status === "failed");
  const searchRows = [...searches].sort(newestFirst("searchedAt"));
  const areas = new Map();
  searchRows.forEach((search) => {
    const key = String(search.displayName || "Unknown area");
    const area = areas.get(key) || {
      displayName: key,
      searchCount: 0,
      blindSpotSearches: 0,
      commercialOnlySearches: 0,
      emptySearches: 0,
      weakDiscoveryCellCount: 0,
      sourceContributors: new Set(),
      lastSearchedAt: null,
    };
    area.searchCount += 1;
    area.blindSpotSearches += search.blindSpot ? 1 : 0;
    area.commercialOnlySearches += search.coverageState === "commercial-only" ? 1 : 0;
    area.emptySearches += search.coverageState === "empty" ? 1 : 0;
    area.weakDiscoveryCellCount = Math.max(
      area.weakDiscoveryCellCount,
      Number(search.weakDiscoveryCellCount || 0),
    );
    (search.sourceContributors || []).forEach((source) => area.sourceContributors.add(source));
    if (!area.lastSearchedAt || timestamp(search.searchedAt) > timestamp(area.lastSearchedAt)) {
      area.lastSearchedAt = search.searchedAt;
    }
    areas.set(key, area);
  });
  const coverageAreas = [...areas.values()]
    .map((area) => ({ ...area, sourceContributors: [...area.sourceContributors].sort() }))
    .sort(
      (first, second) =>
        second.blindSpotSearches - first.blindSpotSearches ||
        timestamp(second.lastSearchedAt) - timestamp(first.lastSearchedAt),
    );

  return {
    generatedAt: new Date(now).toISOString(),
    summary: {
      sources: sourceRows.length,
      enabledSources: sourceRows.filter((source) => source.enabled !== false).length,
      degradedSources: sourceRows.filter((source) => source.degraded).length,
      staleSources: sourceRows.filter((source) => source.stale).length,
      dueSources: sourceRows.filter((source) => source.due && source.enabled !== false).length,
      discoveryCells: discoveryRows.length,
      pendingDiscovery: discoveryRows.filter((job) => job.status === "pending").length,
      failedDiscovery: discoveryRows.filter((job) => job.status === "failed").length,
      reviewCandidates: reviewCandidates.length,
      failedRuns: failedRuns.length,
      trackedSearches: searchRows.length,
      blindSpotSearches: searchRows.filter((search) => search.blindSpot).length,
      commercialOnlySearches: searchRows.filter((search) => search.coverageState === "commercial-only").length,
      emptySearches: searchRows.filter((search) => search.coverageState === "empty").length,
    },
    sources: sourceRows,
    discoveryJobs: discoveryRows,
    candidates: reviewCandidates,
    ingestionRuns: recentRuns,
    auditLog: [...audits].sort(newestFirst("createdAt")),
    searchCoverage: searchRows,
    coverageAreas,
  };
}
