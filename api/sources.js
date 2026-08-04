import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { sourceDocument } from "../lib/server/sourceRegistry.js";

const ALLOWED_PARSERS = new Set([
  "ical",
  "calendar-page",
  "rss",
  "json-ld",
  "json-ld-listing",
  "radio-room",
  "squarespace",
  "peace-center",
  "foundry",
  "series-schedule",
]);

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.INGEST_SECRET && supplied === process.env.INGEST_SECRET);
}

function sourceId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function validateSource(input) {
  const id = sourceId(input.id || input.name);
  const name = String(input.name || "").trim();
  const parser = String(input.parser || "").trim().toLowerCase();
  let url;

  try {
    url = new URL(input.url);
  } catch {
    throw new Error("Source URL is invalid.");
  }

  if (!id || !name) throw new Error("Source id and name are required.");
  if (!ALLOWED_PARSERS.has(parser)) {
    throw new Error(`Unsupported source parser: ${parser}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Source URL must use HTTP or HTTPS.");
  }

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Source latitude and longitude are required.");
  }

  return {
    ...input,
    id,
    name,
    parser,
    url: url.toString(),
    latitude,
    longitude,
    enabled: input.enabled !== false,
  };
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
