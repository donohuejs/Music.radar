const DATE_OPTION_LABELS = {
  tonight: "Tonight",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
  week: "Next 7 days",
  fortnight: "Next 14 days",
  month: "Next 30 days",
};

function formatDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function dateRangeLabel(meta) {
  if (meta?.dateOption !== "custom") return DATE_OPTION_LABELS[meta?.dateOption] || null;
  const start = formatDateValue(meta.customStartDate);
  const end = formatDateValue(meta.customEndDate);
  if (!start || !end) return "Custom dates";
  return start === end ? start : `${start} – ${end}`;
}

function timeZoneLabel(meta) {
  const timeZone = meta?.resolvedLocation?.timeZone;
  if (!timeZone) return null;
  try {
    const instant = new Date(meta.searchStartDate || Date.now());
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
    return name ? `Times in ${name}` : `Times in ${timeZone.replaceAll("_", " ")}`;
  } catch {
    return `Times in ${timeZone.replaceAll("_", " ")}`;
  }
}

export function buildSearchContext(meta) {
  if (!meta) return [];
  const radius = Number(meta.radiusMiles);
  return [
    meta.resolvedLocation?.displayName || null,
    dateRangeLabel(meta),
    Number.isFinite(radius) ? `Within ${radius} mi` : null,
    timeZoneLabel(meta),
  ].filter(Boolean);
}
