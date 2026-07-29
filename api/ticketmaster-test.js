import {
  fetchTicketmasterEvents,
  ticketmasterKeyStatus,
} from "../lib/server/ticketmaster.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const keyStatus = ticketmasterKeyStatus(process.env.TICKETMASTER_API_KEY);

  if (!keyStatus.configured) {
    return response.status(500).json({
      ok: false,
      keyStatus,
      error: "TICKETMASTER_API_KEY is not available to this deployment.",
    });
  }

  try {
    const events = await fetchTicketmasterEvents({
      apiKey: process.env.TICKETMASTER_API_KEY,
      lat: 32.7765,
      lng: -79.9311,
      radius: 25,
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    return response.status(200).json({
      ok: true,
      keyStatus,
      eventCount: events.length,
      sampleEvents: events.slice(0, 5).map((event) => ({
        name: event.name,
        venueName: event.venueName,
        startTime: event.startTime,
      })),
    });
  } catch (error) {
    return response.status(502).json({
      ok: false,
      keyStatus,
      error: error.message,
    });
  }
}
