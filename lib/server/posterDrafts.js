import { createHash } from "node:crypto";

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_PATTERN = Object.keys(MONTHS).join("|");
const DATE_PATTERNS = [
  new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`, "i"),
  /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/,
];
const TIME_PATTERN = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i;
const MONTH_DAY_PATTERN = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function isoDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(line) {
  for (let index = 0; index < DATE_PATTERNS.length; index += 1) {
    const match = line.match(DATE_PATTERNS[index]);
    if (!match) continue;
    const values = index === 0
      ? [Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2])]
      : index === 1
        ? [Number(match[1]), Number(match[2]), Number(match[3])]
        : [Number(match[3]), Number(match[1]), Number(match[2])];
    const date = isoDate(...values);
    if (date) return { date, text: match[0] };
  }
  return null;
}

function inferredSeriesYear(lines, referenceDate, statedWeekday) {
  if (!referenceDate) return null;
  const reference = new Date(referenceDate);
  if (!Number.isFinite(reference.getTime())) return null;
  const weekday = String(statedWeekday || "").trim().toLowerCase();
  const weekdayIndex = WEEKDAYS.indexOf(weekday);
  if (weekdayIndex < 0) return null;
  const monthDays = lines.flatMap((line) => {
    if (DATE_PATTERNS.some((pattern) => pattern.test(line))) return [];
    const match = line.match(MONTH_DAY_PATTERN);
    return match ? [{ month: MONTHS[match[1].toLowerCase()], day: Number(match[2]) }] : [];
  });
  if (!monthDays.length) return null;

  const years = [reference.getUTCFullYear(), reference.getUTCFullYear() + 1];
  const ranked = years.map((year) => {
    const validDates = monthDays
      .map(({ month, day }) => isoDate(year, month, day))
      .filter(Boolean);
    const weekdayMatches = validDates.filter((date) =>
      new Date(`${date}T12:00:00Z`).getUTCDay() === weekdayIndex,
    ).length;
    const upcomingOrRecent = validDates.filter((date) =>
      new Date(`${date}T23:59:59Z`).getTime() >= reference.getTime() - 45 * 24 * 60 * 60 * 1000,
    ).length;
    return { year, weekdayMatches, upcomingOrRecent };
  }).sort((first, second) =>
    second.weekdayMatches - first.weekdayMatches ||
    second.upcomingOrRecent - first.upcomingOrRecent ||
    first.year - second.year,
  );

  if (ranked[0].weekdayMatches < Math.ceil(monthDays.length / 2)) return null;
  return ranked[0].year;
}

function parseDateWithInference(line, inferredYear) {
  const explicit = parseDate(line);
  if (explicit || !inferredYear) return explicit;
  const match = line.match(MONTH_DAY_PATTERN);
  if (!match) return null;
  const date = isoDate(inferredYear, MONTHS[match[1].toLowerCase()], Number(match[2]));
  return date ? { date, text: match[0], inferredYear: true } : null;
}

function parseTime(line) {
  const match = line.match(TIME_PATTERN);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (/p/i.test(match[3])) hour += 12;
  return {
    time: `${String(hour).padStart(2, "0")}:${match[2] || "00"}`,
    text: match[0],
  };
}

function possibleTitle(line, dateText, timeText) {
  const value = String(line || "")
    .replace(dateText || "", " ")
    .replace(timeText || "", " ")
    .replace(/\b(?:at|doors?|show|music|concert|presents?|featuring|feat\.?)\b/gi, " ")
    .replace(/[|•·—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.length >= 2 && value.length <= 140 && /[a-z]/i.test(value) ? value : null;
}

export function extractPosterDrafts(text, {
  candidateId = "poster",
  referenceDate = null,
  statedWeekday = null,
} = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 1000);
  const inferredYear = inferredSeriesYear(lines, referenceDate, statedWeekday);
  const drafts = [];

  lines.forEach((line, index) => {
    const parsedDate = parseDateWithInference(line, inferredYear);
    if (!parsedDate) return;
    const sameLineTime = parseTime(line);
    const nearbyTime = sameLineTime || parseTime(lines[index + 1] || "") || parseTime(lines[index - 1] || "");
    const title =
      possibleTitle(line, parsedDate.text, sameLineTime?.text) ||
      possibleTitle(lines[index - 1], null, parseTime(lines[index - 1] || "")?.text) ||
      possibleTitle(lines[index + 1], null, parseTime(lines[index + 1] || "")?.text);
    const missing = [!title && "title", !nearbyTime && "time", "timezone"].filter(Boolean);
    const context = lines.slice(Math.max(0, index - 1), index + 2).join(" | ");
    const id = createHash("sha256")
      .update(`${candidateId}|${parsedDate.date}|${nearbyTime?.time || ""}|${title || ""}|${index}`)
      .digest("hex")
      .slice(0, 20);
    drafts.push({
      id,
      name: title,
      localDate: parsedDate.date,
      localTime: nearbyTime?.time || null,
      timeZone: null,
      status: "needs-review",
      publishable: false,
      missing,
      confidence: Number((0.45 + (title ? 0.25 : 0) + (nearbyTime ? 0.2 : 0)).toFixed(2)),
      dateYearInferred: parsedDate.inferredYear === true,
      inferenceEvidence: parsedDate.inferredYear ? {
        referenceDate: referenceDate || null,
        statedWeekday: statedWeekday || null,
      } : null,
      sourceLine: index + 1,
      context,
    });
  });

  const unique = new Map();
  drafts.forEach((draft) => {
    const key = `${draft.localDate}|${draft.localTime}|${String(draft.name || "").toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, draft);
  });
  return [...unique.values()].slice(0, 100);
}
