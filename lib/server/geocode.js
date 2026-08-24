import tzLookup from "tz-lookup";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

function parseCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function timeZoneForCoordinates(latitudeValue, longitudeValue) {
  const latitude = parseCoordinate(latitudeValue);
  const longitude = parseCoordinate(longitudeValue);
  if (
    latitude === null || longitude === null ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    throw new Error("Valid latitude and longitude are required.");
  }
  return tzLookup(latitude, longitude);
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
    const country = address.country || null;
    const countryCode = String(address.country_code || "").toUpperCase() || null;

    return {
      latitude,
      longitude,
      timeZone: timeZoneForCoordinates(latitude, longitude),
      displayName:
        [city, state, countryCode === "US" ? null : country].filter(Boolean).join(", ") ||
        result.display_name ||
        location,
      rawDisplayName: result.display_name || location,
      country,
      countryCode,
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

export async function reverseGeocodeCoordinates(
  latitudeValue,
  longitudeValue,
  { timeoutMs = 8000 } = {},
) {
  const latitude = parseCoordinate(latitudeValue);
  const longitude = parseCoordinate(longitudeValue);
  if (
    latitude === null || longitude === null ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    throw new Error("Valid latitude and longitude are required.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
  });

  try {
    const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
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
    const result = await response.json();
    const address = result?.address || {};
    const city =
      address.city || address.town || address.village || address.hamlet || address.county;
    const state = address.state;
    const postalCode = address.postcode;
    const country = address.country;
    const countryCode = String(address.country_code || "").toUpperCase() || null;
    const displayName = [city, state, postalCode, countryCode === "US" ? null : country]
      .filter(Boolean).join(", ");
    if (!displayName) throw new Error("Location name was not available.");
    return {
      latitude,
      longitude,
      timeZone: timeZoneForCoordinates(latitude, longitude),
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      country: country || null,
      countryCode,
      displayName,
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
