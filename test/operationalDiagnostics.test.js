import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationalDiagnostics } from "../lib/server/operationalDiagnostics.js";

test("summarizes actionable operational health without mutating records", () => {
  const now = new Date("2026-08-05T12:00:00Z").getTime();
  const source = {
    id: "broken",
    name: "Broken Calendar",
    enabled: true,
    lastRunAt: "2026-07-20T12:00:00Z",
    lastRunOk: false,
    consecutiveFailures: 3,
    nextIngestAt: "2026-08-05T10:00:00Z",
  };
  const diagnostics = buildOperationalDiagnostics({
    sources: [source, { id: "new", name: "New Source", enabled: true }],
    jobs: [{ id: "cell", status: "failed", updatedAt: "2026-08-05T11:00:00Z" }],
    candidates: [
      { id: "review", status: "validated-candidate", score: 0.97, url: "https://example.com/feed" },
      { id: "registered", status: "registered", score: 0.99 },
    ],
    runs: [{ id: "run", status: "failed", completedAt: "2026-08-05T09:00:00Z" }],
    searches: [
      { id: "search", displayName: "Chicago, IL", searchedAt: "2026-08-05T11:00:00Z", blindSpot: true, coverageState: "commercial-only", weakDiscoveryCellCount: 2, sourceContributors: ["Ticketmaster"] },
    ],
  }, now);

  assert.equal(diagnostics.summary.enabledSources, 2);
  assert.equal(diagnostics.summary.degradedSources, 1);
  assert.equal(diagnostics.summary.staleSources, 2);
  assert.equal(diagnostics.summary.dueSources, 2);
  assert.equal(diagnostics.summary.failedDiscovery, 1);
  assert.equal(diagnostics.summary.reviewCandidates, 1);
  assert.equal(diagnostics.summary.failedRuns, 1);
  assert.equal(diagnostics.summary.blindSpotSearches, 1);
  assert.equal(diagnostics.summary.commercialOnlySearches, 1);
  assert.equal(diagnostics.coverageAreas[0].displayName, "Chicago, IL");
  assert.equal(diagnostics.coverageAreas[0].weakDiscoveryCellCount, 2);
  assert.equal(diagnostics.sources[0].id, "broken");
  assert.equal(diagnostics.candidates[0].duplicateSourceId, null);
  assert.equal(source.stale, undefined);
});

test("marks review candidates that duplicate a registered source URL", () => {
  const diagnostics = buildOperationalDiagnostics({
    sources: [{ id: "existing", name: "Existing", url: "https://example.com/calendar" }],
    candidates: [{ id: "candidate", status: "discovered", feedUrl: "https://example.com/calendar" }],
  });
  assert.equal(diagnostics.candidates[0].duplicateSourceId, "existing");
});

test("keeps full poster OCR out of dashboard diagnostics", () => {
  const diagnostics = buildOperationalDiagnostics({
    candidates: [{ id: "poster", status: "poster-review", extractedText: "x".repeat(1000) }],
  });
  assert.equal(diagnostics.candidates[0].extractedText, undefined);
  assert.equal(diagnostics.candidates[0].extractedTextPreview.length, 500);
});

test("puts fresh community submissions at the front of the review queue", () => {
  const diagnostics = buildOperationalDiagnostics({
    candidates: [
      { id: "high-score", status: "discovered", score: 0.99, lastDiscoveredAt: "2026-08-24T10:00:00Z" },
      { id: "community", status: "discovered", score: 0.2, publicSubmission: true, lastSubmittedAt: "2026-08-24T11:00:00Z" },
    ],
  });
  assert.equal(diagnostics.candidates[0].id, "community");
});

test("summarizes fresh provider evidence and Discogs incremental lift", () => {
  const now = Date.parse("2026-08-05T12:00:00.000Z");
  const fresh = "2026-08-05T10:00:00.000Z";
  const diagnostics = buildOperationalDiagnostics({ genreCaches: [
    { id: "discogs-only", queryArtistName: "Local Artist", status: "matched", genres: ["Rock"], checkedAt: fresh, affectedEventCount: 2, evidence: [
      { provider: "discogs", status: "matched", genres: ["Rock"], sourceUrl: "https://www.discogs.com/release/1" },
      { provider: "appleMusic", status: "unavailable", genres: [] },
      { provider: "musicbrainz", status: "no-match", genres: [] },
    ] },
    { id: "corroborated", queryArtistName: "Known Artist", status: "matched", genres: ["Electronic"], checkedAt: fresh, affectedEventCount: 1, evidence: [
      { provider: "discogs", status: "matched", genres: ["Electronic"], sourceUrl: "https://www.discogs.com/release/2" },
      { provider: "musicbrainz", status: "matched", genres: ["Electronic"] },
    ] },
    { id: "conflict", queryArtistName: "Conflicted Artist", status: "conflict", genres: [], checkedAt: fresh, evidence: [
      { provider: "discogs", status: "matched", genres: ["Jazz"], sourceUrl: "https://www.discogs.com/release/3" },
      { provider: "musicbrainz", status: "matched", genres: ["Rock"] },
    ] },
    { id: "stale", queryArtistName: "Stale Artist", status: "matched", genres: ["Pop"], checkedAt: "2026-08-05T05:00:00.000Z", evidence: [
      { provider: "discogs", status: "matched", genres: ["Pop"], sourceUrl: "https://www.discogs.com/release/4" },
    ] },
    { id: "musicbrainz-only", queryArtistName: "MusicBrainz Artist", status: "matched", genres: ["Folk"], checkedAt: fresh, evidence: [
      { provider: "discogs", status: "no-match", genres: [] },
      { provider: "musicbrainz", status: "matched", genres: ["Folk"] },
    ], errors: [{ provider: "appleMusic", message: "temporary", retryable: true }] },
  ] }, now);

  assert.equal(diagnostics.genreImpact.checkedArtists, 5);
  assert.equal(diagnostics.genreImpact.publishedArtists, 3);
  assert.equal(diagnostics.genreImpact.discogsMatches, 3);
  assert.equal(diagnostics.genreImpact.discogsOnly, 1);
  assert.equal(diagnostics.genreImpact.corroborated, 1);
  assert.equal(diagnostics.genreImpact.conflicts, 1);
  assert.equal(diagnostics.genreImpact.staleDiscogs, 1);
  assert.equal(diagnostics.genreImpact.affectedEvents, 3);
  assert.equal(diagnostics.genreImpact.providerErrors, 1);
  assert.equal(diagnostics.genreImpact.incrementalCoveragePercent, 20);
  assert.equal(diagnostics.genreImpact.recentArtists.find((artist) => artist.id === "stale").discogsUrl, null);
  assert.deepEqual(diagnostics.genreImpact.recentArtists.find((artist) => artist.id === "stale").genres, []);
});
