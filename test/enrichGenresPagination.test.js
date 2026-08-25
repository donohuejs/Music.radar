import test from "node:test";
import assert from "node:assert/strict";
import {
  genreEnrichmentPageSize,
  genreQueueCandidates,
  genreEnrichmentScanState,
} from "../api/enrich-genres.js";

test("bounds each enrichment page by its artist lookup budget", () => {
  assert.equal(genreEnrichmentPageSize(4), 4);
  assert.equal(genreEnrichmentPageSize(100), 8);
  assert.equal(genreEnrichmentPageSize(0), 4);
});

test("keeps draining a full artist queue page", () => {
  assert.deepEqual(
    genreEnrichmentScanState({
      pageSize: 4,
      snapshotSize: 4,
    }),
    { scanComplete: false, nextCursor: "artist-queue" },
  );
});

test("reports a drained queue only after a short error-free page", () => {
  assert.deepEqual(
    genreEnrichmentScanState({
      pageSize: 4,
      snapshotSize: 0,
      errors: 1,
    }),
    { scanComplete: false, nextCursor: "artist-queue" },
  );
  assert.deepEqual(
    genreEnrichmentScanState({ pageSize: 4, snapshotSize: 0 }),
    { scanComplete: true, nextCursor: null },
  );
  assert.deepEqual(
    genreEnrichmentScanState({
      pageSize: 4,
      snapshotSize: 0,
      backfillComplete: false,
    }),
    { scanComplete: false, nextCursor: "artist-queue" },
  );
});

test("deduplicates upcoming event documents into distinct artist work", () => {
  const { candidates, eventUpdates } = genreQueueCandidates([
    { name: "Sam Godfrey Band - Free Live Music", artistName: "Sam Godfrey Band - Free Live Music", category: "music", genres: ["Genre not listed"], startTime: "2026-08-28T22:00:00Z" },
    { name: "Sam Godfrey Band", artistName: "Sam Godfrey Band", category: "music", genres: ["Genre not listed"], startTime: "2026-09-01T22:00:00Z" },
    { name: "Live Music", category: "music", genres: ["Genre not listed"], startTime: "2026-08-29T22:00:00Z" },
    { name: "Past Artist", category: "music", genres: ["Genre not listed"], startTime: "2026-08-20T22:00:00Z" },
  ], "2026-08-25T12:00:00Z");

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].artistName, "Sam Godfrey Band");
  assert.equal(candidates[0].priorityStartTime, "2026-08-28T22:00:00Z");
  assert.equal(eventUpdates.length, 3);
});
