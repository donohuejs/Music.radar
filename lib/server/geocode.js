const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

function parseCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function geocodeLocation(query, { timeoutMs = 8000 } = {}) {
  const location = String(query || "").trim();

  if (!location) {
    throw new Error("Enter a city, state, ZIP code, or use your current location.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const params = new URLSearchParams({
    q: location,
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    countrycodes: "us",
  });

  try {
    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "MusicRadar/1.0 (https://music-radar-one.vercel.app; contact: music-radar-app)",
      },
    });

    if (!response.ok) {
      throw new Error(`Location service returned HTTP ${response.status}.`);
    }

    const results = await response.json();
    const result = Array.isArray(results) ? results[0] : null;
    const latitude = parseCoordinate(result?.lat);
    const longitude = parseCoordinate(result?.lon);

    if (!result || latitude === null || longitude === null) {
      throw new Error(
        `We could not find "${location}". Try adding the state or using a ZIP code.`,
      );
    }

    const address = result.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.county ||
      null;
    const state = address.state || null;

    return {
      latitude,
      longitude,
      displayName:
        [city, state].filter(Boolean).join(", ") ||
        result.display_name ||
        location,
      rawDisplayName: result.display_name || location,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Location lookup timed out. Please try again.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
