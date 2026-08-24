export const TRAVEL_MODE_OPTIONS = [
  { value: "walk", label: "Walk", defaultMinutes: 20 },
  { value: "transit", label: "Transit", defaultMinutes: 35 },
  { value: "drive", label: "Car", defaultMinutes: 20 },
];

export function travelModeLabel(mode) {
  return TRAVEL_MODE_OPTIONS.find((option) => option.value === mode)?.label || "Travel";
}

export function clampTravelMinutes(value) {
  return Math.min(Math.max(Math.round(Number(value) || 10), 10), 60);
}

export function mapTravelEstimates(estimates = []) {
  return Object.fromEntries(
    estimates
      .filter((estimate) => estimate?.id && Number.isFinite(estimate.minutes))
      .map((estimate) => [estimate.id, {
        minutes: estimate.minutes,
        distanceMiles: Number.isFinite(estimate.distanceMiles)
          ? estimate.distanceMiles
          : null,
      }]),
  );
}

export function attachTravelEstimates(events = [], estimates = {}, mode) {
  return events.map((event) => {
    const estimate = estimates[event.id];
    return estimate
      ? { ...event, travelMinutes: estimate.minutes, travelMode: mode }
      : event;
  });
}

export function countTravelMatches(events = [], maxMinutes) {
  return events.reduce(
    (count, event) => count + (Number.isFinite(event.travelMinutes) &&
      event.travelMinutes <= maxMinutes ? 1 : 0),
    0,
  );
}
