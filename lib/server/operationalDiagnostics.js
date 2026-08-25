const DAY_MS = 24 * 60 * 60 * 1000;
const DISCOGS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const GENRE_PROVIDERS = ["discogs", "appleMusic", "musicbrainz"];

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(field) {
  return (first, second) => timestamp(second[field]) - timestamp(first[field]);
}

function buildGenreImpact(caches, now) {
  const providerStats = Object.fromEntries(GENRE_PROVIDERS.map((provider) => [provider, {
    provider,
    matched: 0,
    noMatch: 0,
    unavailable: 0,
    errors: 0,
  }]));
  const totals = {
    checkedArtists: caches.length,
    publishedArtists: 0,
    discogsMatches: 0,
    discogsOnly: 0,
    corroborated: 0,
    conflicts: 0,
    staleDiscogs: 0,
    providerErrors: 0,
    affectedEvents: 0,
  };

  const rows = caches.map((cache) => {
    const checkedAt = timestamp(cache.checkedAt);
    const discogsFresh = checkedAt > 0 && now - checkedAt < DISCOGS_MAX_AGE_MS;
    const rawEvidence = Array.isArray(cache.evidence) ? cache.evidence : [];
    const rawDiscogsMatch = rawEvidence.find(
      (item) => item.provider === "discogs" && item.status === "matched" && item.genres?.length,
    );
    const evidence = rawEvidence.filter((item) => item.provider !== "discogs" || discogsFresh);
    const errors = Array.isArray(cache.errors) ? cache.errors : [];
    const matched = evidence.filter((item) => item.status === "matched" && item.genres?.length);
    const discogs = matched.find((item) => item.provider === "discogs");
    const otherMatches = matched.filter((item) => item.provider !== "discogs");
    const published = cache.status === "matched" && Array.isArray(cache.genres) && cache.genres.length > 0;
    const publiclyUsable = published && !(rawDiscogsMatch && !discogsFresh);

    if (publiclyUsable) totals.publishedArtists += 1;
    if (rawDiscogsMatch && !discogsFresh) {
      totals.staleDiscogs += 1;
    }
    if (discogs) {
      totals.discogsMatches += 1;
      if (published && otherMatches.length === 0) totals.discogsOnly += 1;
      if (published && otherMatches.length > 0) totals.corroborated += 1;
      if (cache.status === "conflict") totals.conflicts += 1;
      if (published) totals.affectedEvents += Number(cache.affectedEventCount || 0);
    }
    totals.providerErrors += errors.length;

    for (const provider of GENRE_PROVIDERS) {
      const providerEvidence = evidence.find((item) => item.provider === provider);
      if (providerEvidence?.status === "matched" && providerEvidence.genres?.length) {
        providerStats[provider].matched += 1;
      } else if (providerEvidence?.status === "unavailable") {
        providerStats[provider].unavailable += 1;
      } else if (providerEvidence) {
        providerStats[provider].noMatch += 1;
      }
      providerStats[provider].errors += errors.filter((error) => error.provider === provider).length;
    }

    const outcome = !discogsFresh && rawDiscogsMatch
      ? "stale"
      : discogs && published && otherMatches.length === 0
        ? "discogs-only"
        : discogs && published
          ? "corroborated"
          : discogs && cache.status === "conflict"
            ? "conflict"
            : discogs
              ? "discogs-match"
              : "no-discogs-match";
    return {
      id: cache.id,
      artistName: cache.queryArtistName || cache.artistName || "Unknown artist",
      outcome,
      genres: publiclyUsable ? cache.genres.slice(0, 5) : [],
      providers: matched.map((item) => item.provider),
      affectedEventCount: Number(cache.affectedEventCount || 0),
      checkedAt: cache.checkedAt || null,
      discogsUrl: discogs?.sourceUrl || null,
    };
  }).sort(newestFirst("checkedAt"));

  return {
    ...totals,
    incrementalCoveragePercent: totals.checkedArtists
      ? Number(((totals.discogsOnly / totals.checkedArtists) * 100).toFixed(1))
      : 0,
    providers: GENRE_PROVIDERS.map((provider) => providerStats[provider]),
    recentArtists: rows.slice(0, 100),
  };
}

export function buildOperationalDiagnostics(
  { sources = [], jobs = [], candidates = [], runs = [], audits = [], searches = [], genreCaches = [] },
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
      ["discovered", "validated-candidate", "needs-extraction", "poster-review"].includes(
        candidate.status || candidate.lifecycle,
      ),
    )
    .map((candidate) => {
      const { extractedText, ...dashboardCandidate } = candidate;
      return {
        ...dashboardCandidate,
        extractedTextPreview: extractedText ? String(extractedText).slice(0, 500) : null,
        duplicateSourceId:
          sourceByUrl.get(String(candidate.feedUrl || candidate.url || "")) || null,
      };
    })
    .sort(
      (first, second) =>
        Number(second.publicSubmission === true) - Number(first.publicSubmission === true) ||
        timestamp(second.lastSubmittedAt) - timestamp(first.lastSubmittedAt) ||
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
  const genreImpact = buildGenreImpact(genreCaches, now);

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
    genreImpact,
  };
}
