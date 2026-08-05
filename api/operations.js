import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { buildOperationalDiagnostics } from "../lib/server/operationalDiagnostics.js";

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

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }
  if (!authorized(request)) return response.status(401).json({ error: "Unauthorized." });

  const db = getAdminDb();
  if (!db) return response.status(503).json({ error: "Firebase Admin is not configured." });

  try {
    const [sources, jobs, candidates, runs] = await Promise.all([
      db.collection("sources").limit(500).get(),
      db.collection("discoveryJobs").limit(500).get(),
      db.collection("sourceCandidates").limit(500).get(),
      db.collection("ingestionRuns").orderBy("completedAt", "desc").limit(100).get(),
    ]);
    return response.status(200).json(
      buildOperationalDiagnostics({
        sources: documents(sources),
        jobs: documents(jobs),
        candidates: documents(candidates),
        runs: documents(runs),
      }),
    );
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Could not load operational diagnostics." });
  }
}
