import { reverseGeocodeCoordinates } from "../lib/server/geocode.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }
  try {
    const location = await reverseGeocodeCoordinates(request.query.lat, request.query.lng);
    return response.status(200).json(location);
  } catch (error) {
    const invalid = /valid latitude|location name/i.test(error.message || "");
    return response.status(invalid ? 400 : 502).json({
      error: error.message || "Location lookup failed.",
    });
  }
}
