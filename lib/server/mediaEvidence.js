export const MEDIA_EVIDENCE_MAX_ITEMS = 500;
export const MEDIA_EVIDENCE_RETENTION_DAYS = 90;

const EVIDENCE_COLLECTION = "mediaEvidence";
const COUNTER_COLLECTION = "systemCounters";
const COUNTER_ID = "mediaEvidence";

export class MediaEvidenceCapacityError extends Error {
  constructor() {
    super("The poster review queue is currently full. Submit an event-page link instead.");
    this.name = "MediaEvidenceCapacityError";
  }
}

export function buildMediaEvidenceRecord(
  { id, bytes, contentType },
  { now = Date.now(), retentionDays = MEDIA_EVIDENCE_RETENTION_DAYS } = {},
) {
  return {
    candidateId: id,
    bytes,
    contentType,
    byteLength: bytes.length,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    storageMode: "firestore-spark",
  };
}

export function mediaEvidenceBytes(record) {
  const value = record?.bytes;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value?.toUint8Array === "function") return Buffer.from(value.toUint8Array());
  throw new Error("Poster evidence is unavailable.");
}

export async function saveMediaEvidence(db, evidence, options) {
  const reference = db.collection(EVIDENCE_COLLECTION).doc(evidence.id);
  const counterReference = db.collection(COUNTER_COLLECTION).doc(COUNTER_ID);
  let created = false;
  await db.runTransaction(async (transaction) => {
    created = false;
    const [snapshot, counterSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(counterReference),
    ]);
    if (snapshot.exists) return;
    const count = Number(counterSnapshot.exists ? counterSnapshot.data()?.count : 0) || 0;
    if (count >= MEDIA_EVIDENCE_MAX_ITEMS) throw new MediaEvidenceCapacityError();
    created = true;
    transaction.set(reference, buildMediaEvidenceRecord(evidence, options));
    transaction.set(counterReference, {
      count: count + 1,
      capacity: MEDIA_EVIDENCE_MAX_ITEMS,
      updatedAt: new Date(options?.now || Date.now()).toISOString(),
    }, { merge: true });
  });
  return created;
}

export async function loadMediaEvidence(db, id) {
  const snapshot = await db.collection(EVIDENCE_COLLECTION).doc(String(id || "")).get();
  if (!snapshot.exists) throw new Error("Poster evidence was not found.");
  const record = snapshot.data();
  return { ...record, bytes: mediaEvidenceBytes(record) };
}

export async function deleteMediaEvidence(db, id) {
  if (!id) return false;
  const reference = db.collection(EVIDENCE_COLLECTION).doc(id);
  const counterReference = db.collection(COUNTER_COLLECTION).doc(COUNTER_ID);
  let deleted = false;
  await db.runTransaction(async (transaction) => {
    deleted = false;
    const [snapshot, counterSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(counterReference),
    ]);
    if (!snapshot.exists) return;
    deleted = true;
    const count = Number(counterSnapshot.exists ? counterSnapshot.data()?.count : 0) || 0;
    transaction.delete(reference);
    transaction.set(counterReference, {
      count: Math.max(0, count - 1),
      capacity: MEDIA_EVIDENCE_MAX_ITEMS,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
  return deleted;
}

export async function pruneExpiredMediaEvidence(db, { now = Date.now(), limit = 20 } = {}) {
  const snapshot = await db
    .collection(EVIDENCE_COLLECTION)
    .where("expiresAt", "<=", new Date(now).toISOString())
    .limit(limit)
    .get();
  for (const document of snapshot.docs) {
    await deleteMediaEvidence(db, document.id);
    const candidateReference = db.collection("sourceCandidates").doc(document.id);
    const candidateSnapshot = await candidateReference.get();
    const candidate = candidateSnapshot.exists ? candidateSnapshot.data() : null;
    if (
      candidate?.evidenceDocumentId === document.id &&
      ["needs-extraction", "poster-review"].includes(candidate.status || candidate.lifecycle)
    ) {
      await candidateReference.set({
        evidenceDocumentId: null,
        evidenceExpiredAt: new Date(now).toISOString(),
        extractionStatus: "expired",
        status: "expired",
        lifecycle: "expired",
      }, { merge: true });
    }
  }
  return snapshot.docs.length;
}
