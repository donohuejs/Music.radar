export function formatEventDate(value, timeZone) {
  if (!value) return "Time TBD";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time TBD";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: timeZone ? "short" : undefined,
  }).format(date);
}

export function formatTheaterRun(startValue, endValue, timeZone) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return formatEventDate(startValue, timeZone);
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
