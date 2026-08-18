import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { buildOperationalDiagnostics } from "../lib/server/operationalDiagnostics.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";
import { recordIngestionRun, upsertEvents } from "../lib/server/eventStore.js";
import { sourceDocument, updateSourceIngestionHealth } from "../lib/server/sourceRegistry.js";
import { isReusableSourceCandidate, validateSource } from "../lib/server/sourceValidation.js";
import { buildPublishedPosterEvent } from "../lib/server/posterPublication.js";
import { buildEventSuppression, REJECTION_REASONS } from "../lib/server/eventSuppressions.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(
    supplied &&
      (supplied === process.env.INGEST_SECRET || supplied === process.env.CRON_SECRET),
  );
}

function documents(snapshot) {
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

export async function loadOperationalCollection(name, operation, { timeoutMs = 10000 } = {}) {
  let timeout;
  try {
    const snapshot = await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${name} timed out after ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
    return { documents: documents(snapshot), health: { ok: true, error: null } };
  } catch (error) {
    const message = error?.message || `${name} could not be loaded.`;
    console.warn(`${name} diagnostics query failed:`, message);
    return { documents: [], health: { ok: false, error: message } };
  } finally {
    clearTimeout(timeout);
  }
}

export function operationalCollectionFailure(collections) {
  const failed = collections.filter((collection) => collection.health.ok === false);
  if (failed.length !== collections.length) return null;
  const quotaExceeded = failed.every((collection) =>
    /quota exceeded|resource_exhausted/i.test(collection.health.error || ""),
  );
  return quotaExceeded
    ? "Firestore quota is exhausted. Operational data will be available after the quota resets or billing capacity is increased."
    : "Firestore operational data is temporarily unavailable. Try again shortly.";
}

async function audit(db, action, targetType, targetId, outcome, details = {}) {
  await db.collection("operationalAudit").add({
    action,
    targetType,
    targetId,
    outcome,
    details,
    actor: "protected-operator",
    createdAt: new Date().toISOString(),
  });
}

async function approveCandidate(db, candidateId) {
  const reference = db.collection("sourceCandidates").doc(candidateId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Candidate was not found.");
  const candidate = { id: snapshot.id, ...snapshot.data() };
  if (!isReusableSourceCandidate(candidate)) {
    throw new Error("A one-time event page cannot be approved as a reusable ingestion source.");
  }
  if (["approved", "registered", "rejected"].includes(candidate.status)) {
    throw new Error(`Candidate is already ${candidate.status}.`);
  }
  const source = validateSource({
    id: `reviewed-${candidate.id}`,
    name: candidate.name || candidate.organizationName || "Reviewed event source",
    url: candidate.feedUrl || candidate.url,
    parser: candidate.parser,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    category: null,
    categoryMode: "mixed",
    enabled: true,
    discovered: true,
    reviewedAt: new Date().toISOString(),
    discoveryConfidence: Number(candidate.score || 0),
  });
  const duplicate = await db.collection("sources").where("url", "==", source.url).limit(1).get();
  if (!duplicate.empty) throw new Error(`Candidate duplicates registered source ${duplicate.docs[0].id}.`);
  const batch = db.batch();
  batch.set(db.collection("sources").doc(source.id), sourceDocument(source));
  batch.set(reference, {
    status: "approved",
    lifecycle: "approved",
    registeredSourceId: source.id,
    reviewedAt: new Date().toISOString(),
  }, { merge: true });
  await batch.commit();
  return { source };
}

async function suppressEvent(db, input) {
  const suppression = buildEventSuppression(input);
  await db.collection("eventSuppressions").doc(suppression.id).set(suppression, { merge: true });
  return { suppression };
}

async function rejectCandidate(db, candidateId, input) {
  const reference = db.collection("sourceCandidates").doc(candidateId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Candidate was not found.");
  const candidate = { id: snapshot.id, ...snapshot.data() };
  const reason = REJECTION_REASONS.has(input?.reason) ? input.reason : "other";
  const reviewedAt = new Date().toISOString();
  let suppression = null;
  if (input?.suppressEvent === true) {
    suppression = (await suppressEvent(db, {
      url: candidate.url || candidate.feedUrl,
      reason,
      note: input?.note,
      candidateId,
    })).suppression;
  }
  await reference.set({
    status: "rejected",
    lifecycle: "rejected",
    rejectionReason: reason,
    reviewNote: String(input?.note || "").trim().slice(0, 500) || null,
    rejectedAt: reviewedAt,
    reviewedAt,
  }, { merge: true });
  return { candidateId, suppression };
}

async function unsuppressEvent(db, suppressionId) {
  const reference = db.collection("eventSuppressions").doc(suppressionId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Event suppression was not found.");
  await reference.set({ active: false, updatedAt: new Date().toISOString() }, { merge: true });
  return { suppressionId, active: false };
}

async function setSourceEnabled(db, sourceId, enabled) {
  const reference = db.collection("sources").doc(sourceId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Source was not found.");
  await reference.set({ enabled, updatedAt: new Date().toISOString() }, { merge: true });
  return { sourceId, enabled };
}

async function refreshSource(db, sourceId) {
  const reference = db.collection("sources").doc(sourceId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Source was not found.");
  const source = { id: snapshot.id, ...snapshot.data() };
  const startedAt = new Date().toISOString();
  const result = await fetchLocalVenueEvents({ sources: [source], concurrency: 1 });
  const sourceStatus = result.sourceStatus[0];
  const imported = await upsertEvents(db, result.events);
  await updateSourceIngestionHealth(db, [source], [sourceStatus]);
  await recordIngestionRun(db, {
    source: source.id,
    status: sourceStatus.ok ? "success" : "failed",
    startedAt,
    imported,
    sourceStatus: [sourceStatus],
  });
  if (!sourceStatus.ok) throw new Error(sourceStatus.error || "Source refresh failed.");
  return { sourceId, imported, eventCount: sourceStatus.eventCount };
}

async function posterCandidate(db, candidateId) {
  const reference = db.collection("sourceCandidates").doc(candidateId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Poster candidate was not found.");
  const candidate = { id: snapshot.id, ...snapshot.data() };
  if (candidate.status !== "poster-review") throw new Error("Candidate is not awaiting poster review.");
  return { reference, candidate };
}

async function publishPosterDraft(db, candidateId, input) {
  const { reference, candidate } = await posterCandidate(db, candidateId);
  const draftId = String(input?.draftId || "").trim();
  const drafts = Array.isArray(candidate.posterDrafts) ? candidate.posterDrafts : [];
  const draftIndex = drafts.findIndex((draft) => draft.id === draftId);
  if (draftIndex < 0) throw new Error("Poster draft was not found.");
  const event = buildPublishedPosterEvent(candidate, drafts[draftIndex], input || {});
  const imported = await upsertEvents(db, [event]);
  const reviewedAt = new Date().toISOString();
  drafts[draftIndex] = {
    ...drafts[draftIndex],
    status: "published",
    publishable: false,
    publishedEventId: event.id,
    reviewedAt,
    reviewedValues: {
      name: event.name,
      startTime: event.startTime,
      timeZone: input.timeZone,
      venueName: event.venueName,
      category: event.category,
    },
  };
  await reference.set({
    posterDrafts: drafts,
    publishedEventIds: [...new Set([...(candidate.publishedEventIds || []), event.id])],
    reviewedAt,
  }, { merge: true });
  return { candidateId, draftId, eventId: event.id, imported };
}

async function dismissPosterDraft(db, candidateId, input) {
  const { reference, candidate } = await posterCandidate(db, candidateId);
  const draftId = String(input?.draftId || "").trim();
  const drafts = Array.isArray(candidate.posterDrafts) ? candidate.posterDrafts : [];
  const draftIndex = drafts.findIndex((draft) => draft.id === draftId);
  if (draftIndex < 0) throw new Error("Poster draft was not found.");
  if (drafts[draftIndex].status === "published") throw new Error("Published poster drafts cannot be dismissed.");
  drafts[draftIndex] = {
    ...drafts[draftIndex],
    status: "dismissed",
    publishable: false,
    reviewNote: String(input?.note || "Dismissed by operator").trim().slice(0, 500),
    reviewedAt: new Date().toISOString(),
  };
  await reference.set({ posterDrafts: drafts, reviewedAt: new Date().toISOString() }, { merge: true });
  return { candidateId, draftId };
}

function actionTargetType(action) {
  if (action.startsWith("event")) return "event-suppression";
  if (action.startsWith("candidate")) return "candidate";
  if (action.startsWith("poster")) return "poster-draft";
  return "source";
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  if (!authorized(request)) return response.status(401).json({ error: "Unauthorized." });

  const db = getAdminDb();
  if (!db) return response.status(503).json({ error: "Firebase Admin is not configured." });

  try {
    if (request.method === "POST") {
      const action = String(request.body?.action || "");
      const targetId = String(request.body?.candidateId || request.body?.sourceId || request.body?.suppressionId || request.body?.url || "").trim();
      if (!targetId) return response.status(400).json({ error: "An action target is required." });
      let result;
      try {
        if (action === "candidate.approve") result = await approveCandidate(db, targetId);
        else if (action === "candidate.reject") result = await rejectCandidate(db, targetId, request.body);
        else if (action === "event.suppress") result = await suppressEvent(db, request.body);
        else if (action === "event.unsuppress") result = await unsuppressEvent(db, targetId);
        else if (action === "source.set-enabled") result = await setSourceEnabled(db, targetId, request.body?.enabled === true);
        else if (action === "source.refresh") result = await refreshSource(db, targetId);
        else if (action === "poster.publish") result = await publishPosterDraft(db, targetId, request.body);
        else if (action === "poster.dismiss") result = await dismissPosterDraft(db, targetId, request.body);
        else return response.status(400).json({ error: "Unsupported operation." });
        let auditRecorded = true;
        try {
          await audit(db, action, actionTargetType(action), targetId, "success", result);
        } catch (auditError) {
          auditRecorded = false;
          console.error("Operational audit write failed:", auditError);
        }
        return response.status(200).json({ ok: true, auditRecorded, ...result });
      } catch (error) {
        try {
          await audit(db, action || "unknown", actionTargetType(action), targetId, "failed", { error: error.message });
        } catch (auditError) {
          console.error("Operational audit write failed:", auditError);
        }
        return response.status(400).json({ error: error.message });
      }
    }

    const collections = await Promise.all([
      loadOperationalCollection("Sources", () => db.collection("sources").limit(500).get()),
      loadOperationalCollection("Discovery jobs", () => db.collection("discoveryJobs").limit(500).get()),
      loadOperationalCollection("Source candidates", () => db.collection("sourceCandidates").limit(500).get()),
      loadOperationalCollection("Ingestion runs", () => db.collection("ingestionRuns").orderBy("completedAt", "desc").limit(100).get()),
      loadOperationalCollection("Operational audit", () => db.collection("operationalAudit").orderBy("createdAt", "desc").limit(100).get()),
      loadOperationalCollection("Search coverage", () => db.collection("searchCoverage").orderBy("searchedAt", "desc").limit(200).get()),
      loadOperationalCollection("Artist genre cache", () => db.collection("artistGenreCache").limit(1000).get()),
      loadOperationalCollection("Event suppressions", () => db.collection("eventSuppressions").orderBy("updatedAt", "desc").limit(200).get()),
    ]);
    const collectionFailure = operationalCollectionFailure(collections);
    if (collectionFailure) {
      return response.status(503).json({ error: collectionFailure });
    }
    const [sources, jobs, candidates, runs, audits, searches, genreCaches, suppressions] = collections;
    return response.status(200).json({
      ...buildOperationalDiagnostics({
        sources: sources.documents,
        jobs: jobs.documents,
        candidates: candidates.documents,
        runs: runs.documents,
        audits: audits.documents,
        searches: searches.documents,
        genreCaches: genreCaches.documents,
      }),
      eventSuppressions: suppressions.documents,
      collectionHealth: Object.fromEntries(
        ["sources", "discoveryJobs", "sourceCandidates", "ingestionRuns", "operationalAudit", "searchCoverage", "artistGenreCache", "eventSuppressions"]
          .map((name, index) => [name, collections[index].health]),
      ),
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Could not load operational diagnostics." });
  }
}
