import {
  fetchGoogleTravelTimes,
  MAX_TRAVEL_DESTINATIONS,
  TRAVEL_MODES,
} from "../lib/server/travelTimes.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const mode = String(request.body?.mode || "").trim().toLowerCase();
  const destinations = Array.isArray(request.body?.destinations)
    ? request.body.destinations.slice(0, MAX_TRAVEL_DESTINATIONS)
    : [];
  if (!TRAVEL_MODES.includes(mode) || !request.body?.origin || !destinations.length) {
    return response.status(400).json({ error: "A valid origin, travel mode, and destinations are required." });
  }

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) {
    return response.status(200).json({
      estimates: [],
      meta: {
        configured: false,
        provider: null,
        requestedCount: destinations.length,
        estimatedCount: 0,
        truncated: Array.isArray(request.body?.destinations) &&
          request.body.destinations.length > MAX_TRAVEL_DESTINATIONS,
      },
    });
  }

  try {
    const result = await fetchGoogleTravelTimes({
      apiKey,
      origin: request.body.origin,
      destinations,
      mode,
      departureTime: new Date(),
    });
    return response.status(200).json({
      estimates: result.estimates,
      meta: {
        configured: true,
        provider: "google-routes",
        requestedCount: result.requestedCount,
        estimatedCount: result.estimates.length,
        truncated: request.body.destinations.length > MAX_TRAVEL_DESTINATIONS,
      },
    });
  } catch (error) {
    console.warn("Travel-time lookup failed:", error.message || error);
    return response.status(502).json({
      error: "Travel-time estimates are temporarily unavailable.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
