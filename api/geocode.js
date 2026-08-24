import { geocodeLocation } from "../lib/server/geocode.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    const location = await geocodeLocation(request.query.location);
    return response.status(200).json({
      displayName: location.displayName,
      latitude: location.latitude,
      longitude: location.longitude,
      timeZone: location.timeZone,
    });
  } catch (error) {
    const invalid = /could not find|location lookup|location service|enter a city/i.test(
      error.message || "",
    );
    return response.status(invalid ? 400 : 502).json({
      error: error.message || "Location lookup failed.",
    });
  }
}
