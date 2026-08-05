import { createHash } from "node:crypto";

export const REJECTION_REASONS = new Set([
  "not-reusable-source",
  "one-time-event",
  "wrong-category",
  "duplicate",
  "irrelevant",
  "other",
]);

export function canonicalSuppressionUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

export function suppressionId(url) {
  const canonicalUrl = canonicalSuppressionUrl(url);
  if (!canonicalUrl) throw new Error("A valid event URL is required.");
  return createHash("sha256").update(`url:${canonicalUrl}`).digest("hex").slice(0, 32);
}

export function buildEventSuppression(input, now = new Date()) {
  const url = canonicalSuppressionUrl(input?.url);
  if (!url) throw new Error("A valid event URL is required.");
  const reason = REJECTION_REASONS.has(input?.reason) ? input.reason : "other";
  return {
    id: suppressionId(url),
    kind: "url",
    url,
    reason,
    note: String(input?.note || "").trim().slice(0, 500) || null,
    candidateId: input?.candidateId || null,
    active: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function eventUrls(event) {
  return [event?.url, event?.ticketUrl, event?.sourceUrl, ...(event?.ticketUrls || [])]
    .map(canonicalSuppressionUrl)
    .filter(Boolean);
}

export function filterSuppressedEvents(events, suppressions) {
  const blocked = new Set(
    suppressions.filter((item) => item.active !== false && item.kind === "url").map((item) => canonicalSuppressionUrl(item.url)).filter(Boolean),
  );
  return events.filter((event) => !eventUrls(event).some((url) => blocked.has(url)));
}

export async function loadEventSuppressions(db) {
  if (!db) return [];
  const snapshot = await db.collection("eventSuppressions").where("active", "==", true).limit(1000).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}
