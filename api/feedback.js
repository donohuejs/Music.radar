import { getAdminBucket, getAdminDb } from "../lib/server/firebaseAdmin.js";
import {
  buildPublicDiscoveryLead,
  parseMediaDataUrl,
  publicLeadIdentity,
  storageObject,
} from "../lib/server/mediaLeads.js";
import {
  enforceFeedbackRateLimit,
  FeedbackRateLimitError,
} from "../lib/server/feedbackIntake.js";

const MAX_REQUEST_BYTES = 4_000_000;

async function saveCandidate(db, id, candidate) {
  const reference = db.collection("sourceCandidates").doc(id);
  let duplicate = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      duplicate = true;
      const existing = snapshot.data();
      transaction.set(reference, {
        lastSubmittedAt: candidate.submittedAt,
        lastDiscoveredAt: candidate.submittedAt,
        submissionCount: Number(existing.submissionCount || 1) + 1,
      }, { merge: true });
      return;
    }
    transaction.set(reference, candidate);
  });
  return duplicate;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  if (Number(request.headers?.["content-length"] || 0) > MAX_REQUEST_BYTES) {
    return response.status(413).json({ error: "Submission is too large." });
  }

  // A filled honeypot is acknowledged but deliberately never stored.
  if (String(request.body?.website || "").trim()) {
    return response.status(202).json({ accepted: true });
  }

  const db = getAdminDb();
  if (!db) return response.status(503).json({ error: "Event feedback is temporarily unavailable." });

  try {
    const lead = buildPublicDiscoveryLead(request.body);
    const media = request.body?.imageDataUrl ? parseMediaDataUrl(request.body.imageDataUrl) : null;
    const { id, assetHash } = publicLeadIdentity({ bytes: media?.bytes, sourceUrl: lead.sourceUrl });
    await enforceFeedbackRateLimit(db, request);

    let assetStoragePath = null;
    if (media) {
      const bucket = getAdminBucket();
      if (!bucket) return response.status(503).json({ error: "Poster uploads are temporarily unavailable. You can submit the event-page link instead." });
      const object = storageObject(media.contentType, id, "community-leads");
      await bucket.file(object.path).save(media.bytes, {
        resumable: false,
        contentType: media.contentType,
        metadata: { cacheControl: "private, max-age=900" },
      });
      assetStoragePath = object.path;
    }

    const status = media ? "needs-extraction" : "discovered";
    const duplicate = await saveCandidate(db, id, {
      ...lead,
      id,
      assetStoragePath,
      assetHash,
      contentType: media?.contentType || null,
      status,
      lifecycle: status,
      extractionStatus: media ? "pending" : "not-required",
      score: 0.2,
      submissionCount: 1,
      firstDiscoveredAt: lead.submittedAt,
      lastDiscoveredAt: lead.submittedAt,
      lastSubmittedAt: lead.submittedAt,
    });

    return response.status(202).json({ accepted: true, duplicate });
  } catch (error) {
    if (error instanceof FeedbackRateLimitError) {
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
      return response.status(429).json({ error: error.message });
    }
    if (/required|invalid|public HTTP|poster|image|link/i.test(error.message || "")) {
      return response.status(400).json({ error: error.message });
    }
    console.error("Public event feedback failed:", error);
    return response.status(500).json({ error: "Could not submit this event right now. Please try again." });
  }
}
