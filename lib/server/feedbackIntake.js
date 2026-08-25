import { createHash } from "node:crypto";

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT = 5;

export class FeedbackRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super("Too many event submissions. Please try again later.");
    this.name = "FeedbackRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function requestAddress(request) {
  const forwarded = request.headers?.["x-vercel-forwarded-for"] || request.headers?.["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 100);
}

export function feedbackRateLimitId(request, salt = "music-radar-feedback") {
  return createHash("sha256")
    .update(`${salt}|${requestAddress(request)}`)
    .digest("hex")
    .slice(0, 40);
}

export function nextFeedbackRateLimit(current, now = Date.now()) {
  const windowStartedAt = new Date(current?.windowStartedAt || 0).getTime();
  if (!Number.isFinite(windowStartedAt) || now - windowStartedAt >= RATE_WINDOW_MS) {
    return {
      count: 1,
      windowStartedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
  }
  const count = Number(current?.count || 0);
  if (count >= RATE_LIMIT) {
    throw new FeedbackRateLimitError(Math.max(1, Math.ceil((windowStartedAt + RATE_WINDOW_MS - now) / 1000)));
  }
  return {
    count: count + 1,
    windowStartedAt: new Date(windowStartedAt).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export async function enforceFeedbackRateLimit(db, request, { now = Date.now() } = {}) {
  const salt = process.env.FEEDBACK_RATE_LIMIT_SALT || process.env.INGEST_SECRET || process.env.FIREBASE_PROJECT_ID || "music-radar-feedback";
  const reference = db.collection("feedbackRateLimits").doc(feedbackRateLimitId(request, salt));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    transaction.set(reference, nextFeedbackRateLimit(snapshot.exists ? snapshot.data() : null, now));
  });
}
