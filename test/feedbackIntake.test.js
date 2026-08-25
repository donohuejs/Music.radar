import test from "node:test";
import assert from "node:assert/strict";

import {
  feedbackRateLimitId,
  FeedbackRateLimitError,
  nextFeedbackRateLimit,
  requestAddress,
} from "../lib/server/feedbackIntake.js";

test("hashes the forwarded client address instead of retaining it", () => {
  const request = { headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.2" } };
  assert.equal(requestAddress(request), "203.0.113.8");
  const id = feedbackRateLimitId(request, "secret salt");
  assert.equal(id.length, 40);
  assert.doesNotMatch(id, /203/);
});

test("allows five feedback submissions per rolling day", () => {
  const now = Date.parse("2026-08-24T12:00:00Z");
  let state = null;
  for (let count = 1; count <= 5; count += 1) {
    state = nextFeedbackRateLimit(state, now + count);
    assert.equal(state.count, count);
  }
  assert.throws(() => nextFeedbackRateLimit(state, now + 10), FeedbackRateLimitError);
  assert.equal(nextFeedbackRateLimit(state, now + 24 * 60 * 60 * 1000 + 1).count, 1);
});
