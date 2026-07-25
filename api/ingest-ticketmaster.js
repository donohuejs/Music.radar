import { getAdminDb } from "../lib/server/firebaseAdmin.js";
import { fetchTicketmasterEvents } from "../lib/server/ticketmaster.js";

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.INGEST_SECRET && supplied === process.env.INGEST_SECRET);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!authorized(request)) {
    return response.status(401).json({ error: "Unauthorized." });
  }

  const db = getAdminDb();
  if (!db) {
    return response.status(503).json({ error: "Firebase Admin is not configured." });
  }

  const {
    lat = 34.8526,
    lng = -82.394,
    radius = 50,
    days = 90,
    city = "Greenville, SC",
  } = request.body || {};

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + Math.min(Math.max(Number(days) || 90, 1), 365));

  try {
    const events = await fetchTicketmasterEvents({
      apiKey: process.env.TICKETMASTER_API_KEY,
      lat: Number(lat),
      lng: Number(lng),
      radius: Number(radius),
      startDate,
      endDate,
      city,
    });

    const writer = db.bulkWriter();
    for (const event of events) {
      const ref = db.collection("events").doc(event.id.replace("ticketmaster:", "tm_"));
      writer.set(ref, event, { merge: true });
    }
    await writer.close();

    await db.collection("ingestionRuns").add({
      source: "ticketmaster",
      status: "success",
      eventCount: events.length,
      center: { lat: Number(lat), lng: Number(lng), radius: Number(radius), city },
      startedAt: startDate.toISOString(),
      completedAt: new Date().toISOString(),
    });

    return response.status(200).json({ imported: events.length });
  } catch (error) {
    console.error(error);
    await db.collection("ingestionRuns").add({
      source: "ticketmaster",
      status: "failed",
      error: error.message,
      startedAt: startDate.toISOString(),
      completedAt: new Date().toISOString(),
    });
    return response.status(500).json({ error: error.message });
  }
}
