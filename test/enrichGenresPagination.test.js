import test from "node:test";
import assert from "node:assert/strict";
import {
  genreEnrichmentPageSize,
  genreEnrichmentScanState,
} from "../api/enrich-genres.js";

test("bounds each enrichment page by its artist lookup budget", () => {
  assert.equal(genreEnrichmentPageSize(4), 4);
  assert.equal(genreEnrichmentPageSize(100), 8);
  assert.equal(genreEnrichmentPageSize(0), 4);
});

test("advances after a fully processed enrichment page", () => {
  assert.deepEqual(
    genreEnrichmentScanState({
      cursor: "event-0004",
      lastDocumentId: "event-0008",
      pageExhausted: true,
      pageSize: 4,
      snapshotSize: 4,
    }),
    { scanComplete: false, nextCursor: "event-0008" },
  );
});

test("retries only the small current page after an enrichment failure", () => {
  assert.deepEqual(
    genreEnrichmentScanState({
      cursor: "event-0004",
      lastDocumentId: "event-0008",
      pageExhausted: false,
      pageSize: 4,
      snapshotSize: 4,
    }),
    { scanComplete: false, nextCursor: "event-0004" },
  );
});
