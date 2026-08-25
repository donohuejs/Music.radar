import { createHash } from "node:crypto";
import { isIP } from "node:net";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_MEDIA_BYTES = 550_000;
const WEEKDAYS = new Set(["", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
const PRIVATE_IPV4 = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const PRIVATE_IPV6 = /^(?:::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i;

function requiredText(value, field, max = 200) {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  if (!result) throw new Error(`${field} is required.`);
  return result.slice(0, max);
}

function optionalText(value, max = 500) {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, max) : null;
}

export function publicHttpUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error();
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      (isIP(hostname) === 4 && PRIVATE_IPV4.test(hostname)) ||
      (isIP(hostname) === 6 && PRIVATE_IPV6.test(hostname))
    ) {
      throw new Error();
    }
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    throw new Error("Source URL must be a public HTTP(S) URL.");
  }
}

export function parseMediaDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match || !ALLOWED_MEDIA_TYPES.has(match[1].toLowerCase())) {
    throw new Error("Poster must be a JPEG, PNG, or WebP image.");
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) {
    throw new Error("Poster image must be smaller than 550 KB after compression.");
  }
  const validSignature = match[1].toLowerCase() === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1].toLowerCase() === "image/png"
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validSignature) throw new Error("Poster contents do not match the selected image type.");
  return { bytes, contentType: match[1].toLowerCase() };
}

export function buildMediaLead(input, { now = Date.now() } = {}) {
  const name = requiredText(input?.name, "Venue or series name");
  const latitude = Number(input?.latitude);
  const longitude = Number(input?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Valid venue latitude and longitude are required.");
  }
  const captured = input?.capturedAt ? new Date(input.capturedAt) : new Date(now);
  if (!Number.isFinite(captured.getTime()) || captured.getTime() > now + 24 * 60 * 60 * 1000) {
    throw new Error("A valid capture date is required.");
  }
  const statedWeekday = String(input?.statedWeekday || "").trim().toLowerCase();
  if (!WEEKDAYS.has(statedWeekday)) throw new Error("Stated weekday is invalid.");

  const sourceUrl = publicHttpUrl(input?.sourceUrl);

  return {
    name,
    latitude,
    longitude,
    capturedAt: captured.toISOString(),
    statedWeekday: statedWeekday || null,
    sourceUrl,
    venueName: optionalText(input?.venueName, 160) || name,
    address: optionalText(input?.address, 200),
    city: optionalText(input?.city, 100),
    state: optionalText(input?.state, 80),
    postalCode: optionalText(input?.postalCode, 20),
    timeZone: optionalText(input?.timeZone, 100),
    submittedAt: new Date(now).toISOString(),
    discoveryMethod: "operator-media-upload",
    kind: "poster",
    requiresExtraction: true,
    mediaLead: true,
  };
}

export function buildPublicDiscoveryLead(input, { now = Date.now() } = {}) {
  const hasImage = Boolean(input?.imageDataUrl);
  const sourceUrl = publicHttpUrl(input?.sourceUrl);
  if (!hasImage && !sourceUrl) {
    throw new Error("Add a poster or a link to an artist or venue events page.");
  }

  let eventDate = null;
  if (input?.eventDate) {
    const value = String(input.eventDate).trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error("Event date is invalid.");
    }
    eventDate = value;
  }

  const submittedAt = new Date(now).toISOString();
  const name = optionalText(input?.name, 160) || "Community event submission";
  return {
    name,
    sourceUrl,
    url: sourceUrl,
    venueName: optionalText(input?.venueName, 160),
    discoveryLocation: optionalText(input?.location, 200),
    eventDate,
    notes: optionalText(input?.notes, 1000),
    capturedAt: submittedAt,
    submittedAt,
    discoveryMethod: "public-feedback",
    submittedBy: "community",
    kind: hasImage ? "poster" : "community-tip",
    requiresExtraction: hasImage,
    mediaLead: hasImage,
    publicSubmission: true,
    reviewRequired: true,
    sourceScope: "unverified-submission",
  };
}

export function mediaLeadIdentity(bytes, name) {
  const assetHash = createHash("sha256").update(bytes).digest("hex");
  const id = createHash("sha256").update(`media-lead|${assetHash}|${name}`).digest("hex").slice(0, 32);
  return { id, assetHash };
}

export function publicLeadIdentity({ bytes, sourceUrl }) {
  const assetHash = bytes?.length
    ? createHash("sha256").update(bytes).digest("hex")
    : null;
  const identity = assetHash ? `public-media|${assetHash}` : `public-url|${sourceUrl}`;
  return {
    id: createHash("sha256").update(identity).digest("hex").slice(0, 32),
    assetHash,
  };
}
