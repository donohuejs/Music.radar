import test from "node:test";
import assert from "node:assert/strict";
import { sourceCandidateDocument } from "../lib/server/discoveryStore.js";

test("rediscovery preserves a durable candidate rejection", () => {
  const document = sourceCandidateDocument(
    { url: "https://venue.example/event", score: 0.99, kind: "event-detail" },
    { status: "rejected", lifecycle: "rejected", sightings: 1, rejectionReason: "one-time-event", reviewNote: "Not reusable", reviewedAt: "2026-08-04T12:00:00.000Z" },
    { id: "job-1", displayName: "Chicago" },
    new Date("2026-08-05T12:00:00.000Z"),
  );
  assert.equal(document.status, "rejected");
  assert.equal(document.lifecycle, "rejected");
  assert.equal(document.rejectionReason, "one-time-event");
  assert.equal(document.sightings, 2);
});
