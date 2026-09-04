import { timeZoneForCoordinates } from "./geocode.js";

export function sourceTimeZone(source) {
  if (source.timeZone) return source.timeZone;
  if (source.latitude == null || source.longitude == null) return null;
  try {
    return timeZoneForCoordinates(source.latitude, source.longitude);
  } catch {
    return null;
  }
}

export function zonedLocalIso(value, timeZone) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !timeZone) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const second = Number(match[6] || 0);
  const target = Date.UTC(year, month - 1, day, hour, minute, Number(second));
  const check = new Date(target);
  if (month < 1 || month > 12 || day < 1 || check.getUTCDate() !== day ||
      hour > 23 || minute > 59 || second > 59) return null;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let timestamp = target;
  for (let index = 0; index < 4; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
      .map(({ type, value: part }) => [type, part]));
    const wallTime = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
      +parts.hour, +parts.minute, +parts.second);
    if (wallTime === target) return new Date(timestamp).toISOString();
    timestamp += target - wallTime;
  }
  // Do not invent a time in a daylight-saving gap.
  return null;
}

export function jsonLdDate(value, source) {
  if (!value) return null;
  const raw = String(value);
  // Opt-in repair for a verified publisher timezone misconfiguration only.
  if (source.jsonLdTimeZone && raw.includes("T")) {
    return zonedLocalIso(raw, source.jsonLdTimeZone);
  }
  if (/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw)) {
    const timeZone = sourceTimeZone(source);
    if (!timeZone) return null;
    return zonedLocalIso(raw, timeZone);
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
