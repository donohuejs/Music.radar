import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { buildOperationalDiagnostics } from "../lib/server/operationalDiagnostics.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";
import { recordIngestionRun, upsertEvents } from "../lib/server/eventStore.js";
import { sourceDocument, updateSourceIngestionHealth } from "../lib/server/sourceRegistry.js";
import { validateSource } from "../lib/server/sourceValidation.js";

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

async function rejectCandidate(db, candidateId, note) {
  const reference = db.collection("sourceCandidates").doc(candidateId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("Candidate was not found.");
  await reference.set({
    status: "rejected",
    lifecycle: "rejected",
    reviewNote: String(note || "").trim().slice(0, 500) || null,
    reviewedAt: new Date().toISOString(),
  }, { merge: true });
  return { candidateId };
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
      const targetId = String(request.body?.candidateId || request.body?.sourceId || "").trim();
      if (!targetId) return response.status(400).json({ error: "An action target is required." });
      let result;
      try {
        if (action === "candidate.approve") result = await approveCandidate(db, targetId);
        else if (action === "candidate.reject") result = await rejectCandidate(db, targetId, request.body?.note);
        else if (action === "source.set-enabled") result = await setSourceEnabled(db, targetId, request.body?.enabled === true);
        else if (action === "source.refresh") result = await refreshSource(db, targetId);
        else return response.status(400).json({ error: "Unsupported operation." });
        let auditRecorded = true;
        try {
          await audit(db, action, action.startsWith("candidate") ? "candidate" : "source", targetId, "success", result);
        } catch (auditError) {
          auditRecorded = false;
          console.error("Operational audit write failed:", auditError);
        }
        return response.status(200).json({ ok: true, auditRecorded, ...result });
      } catch (error) {
        try {
          await audit(db, action || "unknown", action.startsWith("candidate") ? "candidate" : "source", targetId, "failed", { error: error.message });
        } catch (auditError) {
          console.error("Operational audit write failed:", auditError);
        }
        return response.status(400).json({ error: error.message });
      }
    }

    const [sources, jobs, candidates, runs, audits, searches] = await Promise.all([
      db.collection("sources").limit(500).get(),
      db.collection("discoveryJobs").limit(500).get(),
      db.collection("sourceCandidates").limit(500).get(),
      db.collection("ingestionRuns").orderBy("completedAt", "desc").limit(100).get(),
      db.collection("operationalAudit").orderBy("createdAt", "desc").limit(100).get(),
      db.collection("searchCoverage").orderBy("searchedAt", "desc").limit(200).get(),
    ]);
    return response.status(200).json(
      buildOperationalDiagnostics({
        sources: documents(sources),
        jobs: documents(jobs),
        candidates: documents(candidates),
        runs: documents(runs),
        audits: documents(audits),
        searches: documents(searches),
      }),
    );
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Could not load operational diagnostics." });
  }
}
