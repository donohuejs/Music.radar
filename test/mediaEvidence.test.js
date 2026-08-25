import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMediaEvidenceRecord,
  deleteMediaEvidence,
  MEDIA_EVIDENCE_MAX_ITEMS,
  MediaEvidenceCapacityError,
  mediaEvidenceBytes,
  saveMediaEvidence,
} from "../lib/server/mediaEvidence.js";

function memoryDb() {
  const records = new Map();
  function reference(collection, id) {
    const key = `${collection}/${id}`;
    return { key };
  }
  return {
    records,
    collection(name) {
      return { doc: (id) => reference(name, id) };
    },
    async runTransaction(operation) {
      return operation({
        async get(ref) {
          return { exists: records.has(ref.key), data: () => records.get(ref.key) };
        },
        set(ref, value, options) {
          records.set(ref.key, options?.merge ? { ...(records.get(ref.key) || {}), ...value } : value);
        },
        delete(ref) { records.delete(ref.key); },
      });
    },
  };
}

test("builds bounded private evidence with a ninety-day expiry", () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const record = buildMediaEvidenceRecord(
    { id: "poster", bytes, contentType: "image/jpeg" },
    { now: Date.parse("2026-08-24T12:00:00Z") },
  );
  assert.equal(record.byteLength, 4);
  assert.equal(record.storageMode, "firestore-spark");
  assert.equal(record.expiresAt, "2026-11-22T12:00:00.000Z");
  assert.deepEqual(mediaEvidenceBytes(record), bytes);
});

test("fails closed when the Spark evidence queue reaches its cap", async () => {
  const db = memoryDb();
  db.records.set("systemCounters/mediaEvidence", { count: MEDIA_EVIDENCE_MAX_ITEMS });
  await assert.rejects(
    saveMediaEvidence(db, { id: "overflow", bytes: Buffer.from([1]), contentType: "image/jpeg" }),
    MediaEvidenceCapacityError,
  );
  assert.equal(db.records.has("mediaEvidence/overflow"), false);
});

test("counts each deduplicated evidence record once and releases capacity", async () => {
  const db = memoryDb();
  const evidence = { id: "poster", bytes: Buffer.from([1, 2, 3]), contentType: "image/jpeg" };
  assert.equal(await saveMediaEvidence(db, evidence), true);
  assert.equal(await saveMediaEvidence(db, evidence), false);
  assert.equal(db.records.get("systemCounters/mediaEvidence").count, 1);
  assert.equal(db.records.get("systemCounters/mediaEvidence").capacity, MEDIA_EVIDENCE_MAX_ITEMS);
  assert.equal(await deleteMediaEvidence(db, "poster"), true);
  assert.equal(db.records.get("systemCounters/mediaEvidence").count, 0);
});
