export const MAP_APP_OPTIONS = [
  { value: "apple", label: "Apple Maps", description: "Open directions in Apple Maps" },
  { value: "google", label: "Google Maps", description: "Open directions in Google Maps" },
  { value: "waze", label: "Waze", description: "Open driving directions in Waze" },
];

export const MAP_APP_STORAGE_KEY = "music-radar-map-app";

export function normalizeMapApp(value) {
  return MAP_APP_OPTIONS.some((option) => option.value === value) ? value : null;
}

function coordinate(value, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

export function mapDestination(event = {}) {
  const query = [event.venueName, event.address, event.city, event.state, event.postalCode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");

  // Calendar coordinates can identify the publisher or discovery area instead
  // of the event entrance. A supplied venue address is the safer destination.
  if (query && (event.address || event.city || event.postalCode)) {
    return { coordinates: null, query };
  }

  const latitude = coordinate(event.latitude, -90, 90);
  const longitude = coordinate(event.longitude, -180, 180);
  if (latitude !== null && longitude !== null) {
    return { coordinates: `${latitude},${longitude}`, query: null };
  }

  return query ? { coordinates: null, query } : null;
}

export function buildMapUrl(app, event) {
  const destination = mapDestination(event);
  if (!destination || !normalizeMapApp(app)) return null;
  const value = destination.coordinates || destination.query;

  if (app === "apple") {
    const url = new URL("https://maps.apple.com/");
    url.searchParams.set("daddr", value);
    url.searchParams.set("dirflg", "d");
    return url.toString();
  }
  if (app === "waze") {
    const url = new URL("https://waze.com/ul");
    url.searchParams.set(destination.coordinates ? "ll" : "q", value);
    url.searchParams.set("navigate", "yes");
    url.searchParams.set("utm_source", "music_radar");
    return url.toString();
  }

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", value);
  url.searchParams.set("utm_source", "music_radar");
  url.searchParams.set("utm_campaign", "directions_request");
  return url.toString();
}

export function buildNativeMapUrl(app, event) {
  const destination = mapDestination(event);
  if (!destination || !normalizeMapApp(app)) return null;
  const value = destination.coordinates || destination.query;

  // Apple documents its regular HTTP map link as the direct system-app
  // handoff. Keep HTTPS as the separate browser fallback.
  if (app === "apple") {
    const url = new URL("http://maps.apple.com/");
    url.searchParams.set("daddr", value);
    url.searchParams.set("dirflg", "d");
    return url.toString();
  }

  if (app === "waze") {
    const url = new URL("waze://");
    url.searchParams.set(destination.coordinates ? "ll" : "q", value);
    url.searchParams.set("navigate", "yes");
    return url.toString();
  }

  const url = new URL("comgooglemaps://");
  url.searchParams.set("daddr", value);
  url.searchParams.set("directionsmode", "driving");
  return url.toString();
}

export function launchMapApp(
  app,
  event,
  {
    documentObject = typeof document === "undefined" ? null : document,
    navigate = (url) => window.location.assign(url),
    schedule = (callback, delay) => window.setTimeout(callback, delay),
    cancelSchedule = (timer) => window.clearTimeout(timer),
  } = {},
) {
  const nativeUrl = buildNativeMapUrl(app, event);
  const fallbackUrl = buildMapUrl(app, event);
  if (!nativeUrl || !fallbackUrl) return false;

  if (nativeUrl === fallbackUrl) {
    navigate(nativeUrl);
    return true;
  }

  let timer = null;
  const stopFallback = () => {
    if (timer !== null) cancelSchedule(timer);
    documentObject?.removeEventListener("visibilitychange", handleVisibilityChange);
  };
  function handleVisibilityChange() {
    if (documentObject?.visibilityState === "hidden") stopFallback();
  }

  documentObject?.addEventListener("visibilitychange", handleVisibilityChange);
  try {
    navigate(nativeUrl);
  } catch {
    stopFallback();
    navigate(fallbackUrl);
    return true;
  }

  timer = schedule(() => {
    documentObject?.removeEventListener("visibilitychange", handleVisibilityChange);
    if (documentObject?.visibilityState !== "hidden") navigate(fallbackUrl);
  }, 1200);
  return true;
}

export function mapAppLabel(app) {
  return MAP_APP_OPTIONS.find((option) => option.value === app)?.label || "maps app";
}
