import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureDefaultSources,
  loadEnabledSources,
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
