// Match whole route segments, not words embedded in unrelated slugs.
const EVENT_ROUTE = /^(?:events?|event-details|our-events|upcoming-events|happenings|shows?|calendar|concerts?|garcias-events)$/i;
const LISTING_CHILD = /^(?:all|calendar|list|month|day|week|today|past|upcoming|page|category|categories|tag|tags|search|feed|ical|rss|submit|add|new)$/i;

function routeParts(pathname) {
  return String(pathname || "").split(/[?#]/)[0].split("/").filter(Boolean);
}

export function isEventListingPath(pathname) {
  const parts = routeParts(pathname);
  return EVENT_ROUTE.test(parts.at(-1) || "");
}

export function isEventDetailPath(pathname) {
  const parts = routeParts(pathname);
  const index = parts.findIndex((part) => EVENT_ROUTE.test(part));
  const detail = parts.slice(index + 1);
  return index >= 0 && detail.length > 0 &&
    /^[a-z0-9]/i.test(detail[0]) &&
    !detail.some((part) => LISTING_CHILD.test(part)) &&
    !/\.(?:ics|rss|xml|json|pdf|png|jpe?g|webp|svg)$/i.test(parts.at(-1));
}

export function eventDetailUrl(value, pageUrl) {
  try {
    const url = new URL(value, pageUrl);
    const page = new URL(pageUrl);
    if (!/^https?:$/.test(url.protocol) || url.origin !== page.origin) return null;
    if (!isEventDetailPath(url.pathname)) return null;
    // Calendar exports are individual downloads, not more event pages/feeds.
    if ([...url.searchParams.keys()].some((key) => /^(?:format|ical|icalendar|outlook-ical|feed|tribe_event_display)$/i.test(key))) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
