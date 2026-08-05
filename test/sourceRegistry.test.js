import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureDefaultSources,
  loadEnabledSources,
  loadSourceIngestionBatch,
  sourceIngestionUpdate,
  sourceIsDue,
} from "../lib/server/sourceRegistry.js";
import { VENUE_SOURCES } from "../lib/server/venueSources.js";

test("adds newly shipped defaults without overwriting existing source documents", async () => {
  const existingId = VENUE_SOURCES[0].id;
  const writes = [];
  let committed = false;
  const references = new Map();
  const db = {
    collection() {
      return {
        doc(id) {
          if (!references.has(id)) {
            references.set(id, {
              id,
              async get() {
                return { exists: id === existingId };
              },
            });
          }
          return references.get(id);
        },
      };
    },
    batch() {
      return {
        set(reference, value) {
          writes.push({ reference, value });
        },
        async commit() {
          committed = true;
        },
      };
    },
  };

  assert.equal(await ensureDefaultSources(db), true);
  assert.equal(committed, true);
  assert.equal(writes.length, VENUE_SOURCES.length - 1);
  assert.equal(writes.some(({ reference }) => reference.id === existingId), false);
  assert.equal(
    writes.some(({ reference }) => reference.id === "smileys-on-the-roxx"),
    true,
  );
});

test("schedules successful, unchanged, empty, and failed sources adaptively", () => {
  const now = Date.parse("2026-08-05T12:00:00.000Z");
  assert.equal(sourceIsDue({}, now), true);
  assert.equal(
    sourceIsDue({ nextIngestAt: "2026-08-05T13:00:00.000Z" }, now),
    false,
  );

  const changed = sourceIngestionUpdate({}, { ok: true, eventCount: 4 }, now);
  assert.equal(changed.nextIngestAt, "2026-08-06T06:00:00.000Z");

  const unchanged = sourceIngestionUpdate(
    { lastRunEventCount: 4 },
    { ok: true, eventCount: 0, notModified: true },
    now,
  );
  assert.equal(unchanged.lastRunEventCount, 4);
  assert.equal(unchanged.nextIngestAt, "2026-08-06T12:00:00.000Z");

  const empty = sourceIngestionUpdate({}, { ok: true, eventCount: 0 }, now);
  assert.equal(empty.nextIngestAt, "2026-08-08T12:00:00.000Z");

  const failed = sourceIngestionUpdate(
    { consecutiveFailures: 2 },
    { ok: false, eventCount: 0, error: "Unavailable" },
    now,
  );
  assert.equal(failed.consecutiveFailures, 3);
  assert.equal(failed.nextIngestAt, "2026-08-06T12:00:00.000Z");
});

test("loads a resumable source page and filters it by due time", async () => {
  const documents = [
    { id: "alpha", enabled: true },
    { id: "bravo", enabled: true },
    { id: "charlie", enabled: true, nextIngestAt: "2026-08-06T00:00:00.000Z" },
    { id: "delta", enabled: true },
  ];
  const db = {
    collection(name) {
      if (name === "operationalState") {
        return {
          doc() {
            return {
              async get() {
                return { exists: true, data: () => ({ cursor: "bravo" }) };
              },
            };
          },
        };
      }
      let cursor = null;
      let limit = 4;
      return {
        orderBy() { return this; },
        startAfter(value) { cursor = value; return this; },
        limit(value) { limit = value; return this; },
        async get() {
          const start = cursor
            ? documents.findIndex(({ id }) => id === cursor) + 1
            : 0;
          return {
            docs: documents.slice(start, start + limit).map((document) => {
              const { id, ...data } = document;
              return { id, data: () => data };
            }),
          };
        },
      };
    },
  };

  const batch = await loadSourceIngestionBatch(db, {
    limit: 2,
    now: Date.parse("2026-08-05T12:00:00.000Z"),
  });
  assert.equal(batch.scannedCount, 2);
  assert.deepEqual(batch.sources.map(({ id }) => id), ["delta"]);
  assert.equal(batch.cursor, "delta");
  assert.equal(batch.cycleComplete, false);
});

test("merges newly shipped defaults with registered sources during ingestion", async () => {
  const db = {
    collection() {
      return {
        limit() {
          return this;
        },
        async get() {
          return {
            docs: [{
              id: "radio-room",
              data: () => ({ enabled: true, successfulRuns: 3 }),
            }],
          };
        },
      };
    },
  };

  const sources = await loadEnabledSources(db);
  assert.equal(sources.length, VENUE_SOURCES.length);
  assert.equal(
    sources.find(({ id }) => id === "radio-room").successfulRuns,
    3,
  );
  assert.equal(
    sources.some(({ id }) => id === "png-downtown-alive"),
    true,
  );
});
