const GOOGLE_ROUTE_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export const MAX_TRAVEL_DESTINATIONS = 100;
export const TRAVEL_MODES = ["walk", "transit", "drive"];

const GOOGLE_TRAVEL_MODES = {
  walk: "WALK",
  transit: "TRANSIT",
  drive: "DRIVE",
};

function coordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

export function normalizeTravelPoint(point, { requireId = false } = {}) {
  const latitude = coordinate(point?.latitude, -90, 90);
  const longitude = coordinate(point?.longitude, -180, 180);
  const id = String(point?.id || "").trim();
  if (latitude === null || longitude === null || (requireId && !id)) return null;
  return { id: id || null, latitude, longitude };
}

export function parseRouteDuration(value) {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

function waypoint(point) {
  return {
    waypoint: {
      location: {
        latLng: {
          latitude: point.latitude,
          longitude: point.longitude,
        },
      },
    },
  };
}

export async function fetchGoogleTravelTimes({
  apiKey,
  origin,
  destinations,
  mode,
  departureTime = new Date(),
  timeoutMs = 10000,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("Google Routes is not configured.");
  if (!TRAVEL_MODES.includes(mode)) throw new Error("Choose a valid travel mode.");

  const normalizedOrigin = normalizeTravelPoint(origin);
  if (!normalizedOrigin) throw new Error("A valid travel origin is required.");
  const normalizedDestinations = (Array.isArray(destinations) ? destinations : [])
    .map((destination) => normalizeTravelPoint(destination, { requireId: true }))
    .filter(Boolean)
    .slice(0, MAX_TRAVEL_DESTINATIONS);
  if (!normalizedDestinations.length) return { estimates: [], requestedCount: 0 };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const body = {
    origins: [waypoint(normalizedOrigin)],
    destinations: normalizedDestinations.map(waypoint),
    travelMode: GOOGLE_TRAVEL_MODES[mode],
    departureTime: new Date(departureTime).toISOString(),
  };
  if (mode === "drive") body.routingPreference = "TRAFFIC_AWARE";

  try {
    const response = await fetchImpl(GOOGLE_ROUTE_MATRIX_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Routes service returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : "."}`);
    }

    const elements = await response.json();
    if (!Array.isArray(elements)) throw new Error("Routes service returned an invalid response.");
    const estimates = elements.flatMap((element) => {
      const destination = normalizedDestinations[Number(element?.destinationIndex)];
      const durationSeconds = parseRouteDuration(element?.duration);
      if (
        !destination || durationSeconds === null ||
        element?.condition !== "ROUTE_EXISTS" ||
        (element?.status?.code !== undefined && element.status.code !== 0)
      ) return [];
      return [{
        id: destination.id,
        minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        distanceMiles: Number.isFinite(element.distanceMeters)
          ? element.distanceMeters / 1609.344
          : null,
      }];
    });

    return { estimates, requestedCount: normalizedDestinations.length };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Travel-time lookup timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
