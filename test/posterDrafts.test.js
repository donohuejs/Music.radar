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
  assert.deepEqual(extractPosterDrafts("The Example Band\nJune 12 at 6:30 PM", {
    referenceDate: "2026-05-01T00:00:00Z",
  }), []);
});

test("infers one reviewable series year from capture date and stated weekday", () => {
  const drafts = extractPosterDrafts(`EVERY FRIDAY
August 7 Flipside 6:30 PM
August 14 Swamp Rabbit Bluegrass 6:30 PM
September 4 Randomonium 6:30 PM`, {
    candidateId: "field-poster",
    referenceDate: "2026-08-19T12:00:00Z",
    statedWeekday: "friday",
  });
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].localDate, "2026-08-07");
  assert.equal(drafts[0].name, "Flipside");
  assert.equal(drafts[2].localDate, "2026-09-04");
  assert.equal(drafts[0].dateYearInferred, true);
  assert.equal(drafts[0].publishable, false);
});

test("does not infer a year when weekday evidence is inconsistent", () => {
  assert.deepEqual(extractPosterDrafts("June 12 Example Band 6:30 PM", {
    referenceDate: "2026-05-01T00:00:00Z",
    statedWeekday: "monday",
  }), []);
});

test("keeps incomplete explicit dates visible for review", () => {
  const [draft] = extractPosterDrafts("2026-08-14 Community Celebration");
  assert.equal(draft.localDate, "2026-08-14");
  assert.equal(draft.localTime, null);
  assert.ok(draft.missing.includes("time"));
  assert.ok(draft.missing.includes("timezone"));
});
