import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { sourceDocument } from "../lib/server/sourceRegistry.js";
import { validateSource } from "../lib/server/sourceValidation.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.INGEST_SECRET && supplied === process.env.INGEST_SECRET);
}

export default async function handler(request, response) {
  if (!authorized(request)) {
    return response.status(401).json({ error: "Unauthorized." });
  }

  const db = getAdminDb();
  if (!db) {
    return response.status(503).json({ error: "Firebase Admin is not configured." });
  }

  if (request.method === "GET") {
    const snapshot = await db.collection("sources").orderBy("name").limit(500).get();
    return response.status(200).json({
      sources: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  }

  if (request.method === "POST") {
    try {
      const source = validateSource(request.body || {});
      await db
        .collection("sources")
        .doc(source.id)
        .set(sourceDocument(source), { merge: true });
      return response.status(200).json({ ok: true, source });
    } catch (error) {
      return response.status(400).json({ error: error.message });
    }
  }

  response.setHeader("Allow", "GET, POST");
  return response.status(405).json({ error: "Method not allowed." });
}
