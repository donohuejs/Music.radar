const CATEGORY_SCAN_LABELS = {
  music: "Scan for live music",
  participatory: "Scan for open mics, jams & karaoke",
  trivia: "Scan for trivia",
  theater: "Scan for theater",
  comedy: "Scan for comedy",
  all: "Scan for all events",
};

export function scanButtonLabel(category) {
  return CATEGORY_SCAN_LABELS[category] || "Scan for events";
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
