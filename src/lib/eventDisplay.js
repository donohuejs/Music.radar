const CATEGORY_SCAN_LABELS = {
  music: "Scan for live music",
  participatory: "Scan for open mics, jams & karaoke",
  trivia: "Scan for trivia & games",
  theater: "Scan for theater",
  comedy: "Scan for comedy",
  all: "Scan for all events",
};

const CATEGORY_LABELS = {
  music: "Live music",
  participatory: "Open mic, jams & karaoke",
  trivia: "Trivia & games",
  theater: "Theater",
  comedy: "Comedy",
  community: "Community",
  other: "Other",
};

export function scanButtonLabel(category) {
  return CATEGORY_SCAN_LABELS[category] || "Scan for events";
}

export function eventCategoryLabel(category) {
  return CATEGORY_LABELS[category] || String(category || "").replaceAll("_", " ");
}

export function genreDisplayLabel(event, genre) {
  if (genre !== "Genre not listed") return genre;
  if (event?.genreStatus === "pending") return "Genre lookup pending";
  if (event?.genreStatus === "unavailable") return "Genre not available";
  return genre;
}

function looksLikeStreetAddress(value) {
  return /^(?:\d+\b|p\.?\s*o\.?\s+box\b)/i.test(String(value || "").trim());
}

export function eventLocationDisplay(event = {}) {
  let primary = event.venueName || "Venue TBD";
  let address = String(event.address || "").trim();

  // Older generic-calendar records put a structured LOCATION value in the
  // address while using the calendar title as the venue. Surface the actual
  // venue immediately; refreshed ingestion stores these fields separately.
  if (address && event.venueName && event.venueName === event.sourceName) {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1 && !looksLikeStreetAddress(parts[0])) {
      primary = parts.shift();
      address = parts.join(", ");
    }
  }

  const region = [event.state, event.postalCode].filter(Boolean).join(" ");
  const locality = [event.city, region].filter(Boolean).join(", ");
  const addressIncludesLocality = locality && address.toLowerCase().includes(locality.toLowerCase());
  const secondary = [address, addressIncludesLocality ? null : locality].filter(Boolean).join(" · ");

  return { primary, secondary };
}

export function filterUpcomingEvents(events = [], currentTime = Date.now()) {
  const now = new Date(currentTime).getTime();
  if (!Number.isFinite(now)) return [...events];

  return events.filter((event) => {
    const start = new Date(event?.startTime).getTime();
    return Number.isFinite(start) && start >= now;
  });
}

export function filterAndSortEvents(
  events = [],
  {
    genre = "all",
    query = "",
    sort = "date",
    minDistance = null,
    maxDistance = null,
  } = {},
) {
  const needle = String(query).trim().toLocaleLowerCase();
  const filtered = events.filter((event) => {
    if (genre !== "all" && !(event.genres || []).includes(genre)) return false;
    if (
      Number.isFinite(minDistance) &&
      (!Number.isFinite(event.distanceMiles) || event.distanceMiles <= minDistance)
    ) return false;
    if (
      Number.isFinite(maxDistance) &&
      (!Number.isFinite(event.distanceMiles) || event.distanceMiles > maxDistance)
    ) return false;
    if (!needle) return true;
    return [event.name, event.venueName, event.city, event.state, ...(event.genres || [])]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
  });

  return [...filtered].sort((a, b) => {
    if (sort === "distance") {
      const distanceDifference = (Number.isFinite(a.distanceMiles) ? a.distanceMiles : Infinity) -
        (Number.isFinite(b.distanceMiles) ? b.distanceMiles : Infinity);
      if (distanceDifference) return distanceDifference;
    }
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

const THEATER_RUN_GAP_MS = 14 * 24 * 60 * 60 * 1000;

function theaterIdentity(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function groupTheaterRuns(events = []) {
  const untouched = [];
  const productions = new Map();

  events.forEach((event) => {
    const timestamp = new Date(event?.startTime).getTime();
    if (event?.category !== "theater" || !Number.isFinite(timestamp)) {
      untouched.push(event);
      return;
    }
    const key = `${theaterIdentity(event.name)}|${theaterIdentity(event.venueName)}|${theaterIdentity(event.city)}|${theaterIdentity(event.state)}`;
    const performances = productions.get(key) || [];
    performances.push(event);
    productions.set(key, performances);
  });

  const runs = [];
  productions.forEach((performances) => {
    performances.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    let current = [];
    const finishRun = () => {
      if (!current.length) return;
      const first = current[0];
      const last = current[current.length - 1];
      runs.push(current.length === 1 ? first : {
        ...first,
        id: `theater-run:${first.id}:${last.id}`,
        runEndTime: last.startTime,
        performanceCount: current.length,
      });
    };

    performances.forEach((performance) => {
      const previous = current[current.length - 1];
      if (
        previous &&
        new Date(performance.startTime).getTime() - new Date(previous.startTime).getTime() > THEATER_RUN_GAP_MS
      ) {
        finishRun();
        current = [];
      }
      current.push(performance);
    });
    finishRun();
  });

  return [...untouched, ...runs].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

export function confidenceExplanation(event) {
  const percent = Math.round(Number(event?.confidence || 0) * 100);
  const source = event?.sourceName || "the event source";
  const completeness = [
    event?.startTime && "date and time",
    event?.venueName && "venue",
    event?.ticketUrl && "event link",
  ].filter(Boolean);
  const mergedSources = Array.isArray(event?.externalIds)
    ? new Set(event.externalIds.filter(Boolean)).size
    : 0;
  const parts = [
    `${percent}% is our confidence that this listing's core details are accurate.`,
    `This event received the ${percent}% reliability baseline assigned to its collection method and source (${source}).`,
    `The listing includes structured ${completeness.length ? completeness.join(", ") : "event data"}.`,
  ];

  if (mergedSources > 1) {
    parts.push(`We also merged ${mergedSources} matching provider records and kept the strongest confidence score.`);
  }

  parts.push("It is not a rating of the artist or event.");
  return parts.join(" ");
}
