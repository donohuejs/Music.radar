const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
}

function parseDate(value) {
  const match = DATE_PATTERN.exec(String(value || ""));
  if (!match) return null;
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return check.getUTCFullYear() === date.year &&
    check.getUTCMonth() === date.month - 1 &&
    check.getUTCDate() === date.day
    ? date
    : null;
}

function addDays(date, days) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function timezoneOffset(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  ) - date.getTime();
}

function startOfZonedDay(date, timeZone) {
  const target = Date.UTC(date.year, date.month - 1, date.day);
  let timestamp = target;

  // Recalculate because the first UTC guess can fall on the other side of a
  // daylight-saving transition from the target local midnight.
  for (let index = 0; index < 3; index += 1) {
    const adjusted = target - timezoneOffset(new Date(timestamp), timeZone);
    if (adjusted === timestamp) break;
    timestamp = adjusted;
  }
  return new Date(timestamp);
}

function endOfZonedDay(date, timeZone) {
  return new Date(startOfZonedDay(addDays(date, 1), timeZone).getTime() - 1);
}

function currentZonedDate(now, timeZone) {
  const parts = zonedParts(now, timeZone);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
  };
}

export function getZonedDateRange(
  option,
  customStart,
  customEnd,
  timeZone,
  currentTime = new Date(),
) {
  const now = new Date(currentTime);
  if (Number.isNaN(now.getTime())) throw new Error("A valid current time is required.");

  // This also validates the supplied IANA time-zone identifier.
  const today = currentZonedDate(now, timeZone);
  let startDate;
  let endDate;

  if (option === "custom") {
    const start = parseDate(customStart);
    const end = parseDate(customEnd);
    if (!start || !end) throw new Error("Choose a valid custom date range.");
    startDate = startOfZonedDay(start, timeZone);
    endDate = endOfZonedDay(end, timeZone);
    if (endDate < startDate) throw new Error("Choose a valid custom date range.");
  } else if (option === "tonight") {
    startDate = now;
    endDate = endOfZonedDay(today, timeZone);
  } else if (option === "tomorrow") {
    const tomorrow = addDays(today, 1);
    startDate = startOfZonedDay(tomorrow, timeZone);
    endDate = endOfZonedDay(tomorrow, timeZone);
  } else if (option === "weekend") {
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      today.weekday,
    );
    const friday = addDays(today, (5 - weekday + 7) % 7);
    startDate = startOfZonedDay(friday, timeZone);
    endDate = endOfZonedDay(addDays(friday, 2), timeZone);
  } else {
    const days = option === "fortnight" ? 14 : option === "month" ? 30 : 7;
    startDate = startOfZonedDay(today, timeZone);
    endDate = endOfZonedDay(addDays(today, days), timeZone);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    timeZone,
  };
}
