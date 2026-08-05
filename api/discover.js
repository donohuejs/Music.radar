import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import {
  claimDiscoveryJob,
  discoveryFailureState,
  loadPendingDiscoveryJobs,
  queueDiscoveryJobsForArea,
  saveSourceCandidates,
  updateDiscoveryJob,
} from "../lib/server/discoveryStore.js";
import { sourceDocument } from "../lib/server/sourceRegistry.js";
import { discoverLocationSourceBatch } from "../lib/server/sourceDiscovery.js";
import { fetchLocalVenueEvents } from "../lib/server/localVenues.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(
    supplied &&
      (supplied === process.env.CRON_SECRET || supplied === process.env.INGEST_SECRET),
  );
}

function automaticSource(candidate, validation) {
  if (
    candidate.kind !== "calendar" ||
    candidate.score < 0.94 ||
    !validation?.ok ||
    !candidate.parser
  ) {
    return null;
  }

  return {
    id: `discovered-${candidate.organizationType}-${candidate.url}`,
    name: candidate.name,
    url: candidate.feedUrl || candidate.url,
    parser: candidate.parser,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    category: "music",
    enabled: true,
    discovered: true,
    discoveryConfidence: candidate.score,
    validatedEventCount: validation.eventCount,
    organizationUrl: candidate.organizationUrl,
  };
}

function safeDocumentId(value) {
  return String(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function validateCandidate(candidate) {
  if (candidate.kind !== "calendar" || candidate.score < 0.94 || !candidate.parser) {
    return { ok: false, eventCount: 0 };
  }
  const source = automaticSource(candidate, { ok: true, eventCount: 0 });
  const result = await fetchLocalVenueEvents({ sources: [source], concurrency: 1 });
  const now = Date.now() - 24 * 60 * 60 * 1000;
  const horizon = Date.now() + 2 * 365 * 24 * 60 * 60 * 1000;
  const plausibleEvents = result.events.filter((event) => {
    const timestamp = new Date(event.startTime).getTime();
    return Number.isFinite(timestamp) && timestamp >= now && timestamp <= horizon;
  });
  return {
    ok: result.sourceStatus[0]?.ok === true && plausibleEvents.length > 0,
    eventCount: plausibleEvents.length,
  };
}

async function registerAutomaticSources(db, candidates) {
  const validated = [];
  for (const candidate of candidates.slice(0, 30)) {
    try {
      const validation = await validateCandidate(candidate);
      const source = automaticSource(candidate, validation);
      if (source) validated.push({ candidate, validation, source });
    } catch {
      // Invalid candidates remain visible for later review.
    }
  }
  const sources = validated.map(({ source }) => source);
  if (!sources.length) return 0;
  const sourceReferences = sources.map((source) =>
    db.collection("sources").doc(safeDocumentId(source.id)),
  );
  const sourceSnapshots = await db.getAll(...sourceReferences);
  const writer = db.bulkWriter();
  validated.forEach(({ candidate, validation, source }, index) => {
    const id = safeDocumentId(source.id);
    const existing = sourceSnapshots[index].exists
      ? sourceSnapshots[index].data()
      : null;
    writer.set(
      sourceReferences[index],
      sourceDocument({
        ...source,
        id,
        lifecycle: existing?.lifecycle || "probation",
        successfulRuns: Number(existing?.successfulRuns || 0),
        failedRuns: Number(existing?.failedRuns || 0),
        consecutiveFailures: Number(existing?.consecutiveFailures || 0),
      }),
      { merge: true },
    );
    writer.set(
      db.collection("sourceCandidates").doc(candidate.id),
      {
        lifecycle: "probation",
        status: "probation",
        validationRuns: Number(candidate.validationRuns || 0) + 1,
        validatedEventCount: validation.eventCount,
        lastValidatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  });
  await writer.close();
  return sources.length;
}

async function runJobs(db, limit, deadline) {
  const jobs = await loadPendingDiscoveryJobs(db, Math.min(limit, 3));
  const results = [];

  for (const pendingJob of jobs) {
    if (Date.now() >= deadline) break;
    const job = await claimDiscoveryJob(db, pendingJob);
    if (!job) continue;
    try {
      const batch = await discoverLocationSourceBatch(job, {
        organizationOffset: Number(job.organizationOffset || 0),
        maxOrganizations: 2,
        deadline,
        organizations: job.organizations,
      });
      const savedCandidates = await saveSourceCandidates(db, batch.candidates, job);
      const registeredSources = await registerAutomaticSources(db, savedCandidates);
      const candidateCount = Number(job.candidateCount || 0) + savedCandidates.length;
      const registeredSourceCount =
        Number(job.registeredSourceCount || 0) + registeredSources;
      await updateDiscoveryJob(db, job.id, {
        status: batch.complete ? "complete" : "pending",
        completedAt: batch.complete ? new Date().toISOString() : null,
        organizationOffset: batch.nextOffset,
        organizationCount: batch.organizationCount,
        organizations: batch.complete ? [] : batch.organizations,
        candidateCount,
        registeredSourceCount,
        priority: batch.complete ? 0 : Number(job.priority || 0),
        consecutiveFailures: 0,
        leaseExpiresAt: null,
        retryAfter: null,
        error: null,
      });
      results.push({
        id: job.id,
        ok: true,
        complete: batch.complete,
        processedOrganizations: batch.processedOrganizations,
        organizationOffset: batch.nextOffset,
        organizationCount: batch.organizationCount,
        candidateCount,
        registeredSourceCount,
      });
    } catch (error) {
      const failure = discoveryFailureState(job);
      await updateDiscoveryJob(db, job.id, {
        ...failure,
        error: error.message,
      });
      results.push({
        id: job.id,
        ok: failure.status !== "failed",
        deferred: failure.status === "pending",
        consecutiveFailures: failure.consecutiveFailures,
        error: error.message,
      });
    }
  }
  return results;
}

export default async function handler(request, response) {
  if (!authorized(request)) return response.status(401).json({ error: "Unauthorized." });
  const db = getAdminDb();
  if (!db) return response.status(503).json({ error: "Firebase Admin is not configured." });

  if (request.method === "GET") {
    const snapshot = await db.collection("sourceCandidates").limit(250).get();
    return response.status(200).json({
      candidates: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const action = String(request.body?.action || "run").toLowerCase();
  if (action === "poster-extraction") {
    const candidateId = String(request.body?.candidateId || "").trim();
    const assetHash = String(request.body?.assetHash || "").trim();
    const extractedText = String(request.body?.extractedText || "").trim();
    if (!candidateId || !/^[a-f0-9]{64}$/i.test(assetHash) || !extractedText) {
      return response.status(400).json({ error: "Candidate id, asset hash, and extracted text are required." });
    }
    await db
      .collection("sourceCandidates")
      .doc(candidateId)
      .set(
        {
          assetHash,
          extractedText: extractedText.slice(0, 100_000),
          extractionStatus: "extracted",
          extractedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    return response.status(200).json({ ok: true, candidateId });
  }

  if (action === "queue") {
    const latitude = Number(request.body?.latitude);
    const longitude = Number(request.body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return response.status(400).json({ error: "Valid latitude and longitude are required." });
    }
    const coverage = await queueDiscoveryJobsForArea(
      db,
      {
        latitude,
        longitude,
        displayName: request.body?.displayName,
        radiusMiles: request.body?.radiusMiles,
      },
      { force: request.body?.force === true },
    );
    return response.status(200).json({ ok: true, ...coverage });
  }

  const results = await runJobs(
    db,
    Number(request.body?.limit) || 1,
    Date.now() + 40_000,
  );
  return response.status(200).json({ ok: true, processed: results.length, results });
}
