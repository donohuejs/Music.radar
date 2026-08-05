import test from "node:test";
import assert from "node:assert/strict";

import { extractPosterDrafts } from "../lib/server/posterDrafts.js";

test("creates review-only drafts from explicit poster dates and times", () => {
  const drafts = extractPosterDrafts(`SUMMER MUSIC SERIES
The Example Band
June 12, 2026 | 6:30 PM
Town Square`, { candidateId: "poster-one" });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, "The Example Band");
  assert.equal(drafts[0].localDate, "2026-06-12");
  assert.equal(drafts[0].localTime, "18:30");
  assert.equal(drafts[0].publishable, false);
  assert.deepEqual(drafts[0].missing, ["timezone"]);
});

test("does not turn dates without an explicit year into event drafts", () => {
  assert.deepEqual(extractPosterDrafts("The Example Band\nJune 12 at 6:30 PM"), []);
});

test("keeps incomplete explicit dates visible for review", () => {
  const [draft] = extractPosterDrafts("2026-08-14 Community Celebration");
  assert.equal(draft.localDate, "2026-08-14");
  assert.equal(draft.localTime, null);
  assert.ok(draft.missing.includes("time"));
  assert.ok(draft.missing.includes("timezone"));
});
