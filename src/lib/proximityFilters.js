export const PROXIMITY_PRESETS = [
  { label: "Walkable", value: "walkable", miles: 1.5 },
  { label: "Short trip", value: "short-trip", miles: 5 },
  { label: "Across town", value: "across-town", miles: 10 },
];

export function buildProximityModel(proximity, resultRadius) {
  const radius = Math.max(Number(resultRadius) || 1, 0.5);
  const availablePresets = PROXIMITY_PRESETS.filter((option) => option.miles < radius);
  const selectedPreset = PROXIMITY_PRESETS.find((option) => option.value === proximity?.mode);
  const customDistance = Math.min(
    Math.max(Number(proximity?.customMiles) || 0.5, 0.5),
    radius,
  );
  const maxDistance = proximity?.mode === "custom"
    ? customDistance
    : proximity?.mode === "all"
      ? null
      : Math.min(selectedPreset?.miles || radius, radius);
  const summary = proximity?.mode === "all"
    ? `All · ${radius} mi`
    : proximity?.mode === "custom"
      ? `Custom · ≤${customDistance} mi`
      : `${selectedPreset?.label || "Nearby"} · ≤${maxDistance} mi`;

  return {
    availablePresets,
    customDistance,
    maxDistance,
    selectedPreset,
    summary,
  };
}

export function countEventsByProximity(events, presets, customDistance) {
  const counts = { all: events.length, custom: 0, presets: {} };

  events.forEach((event) => {
    if (!Number.isFinite(event?.distanceMiles)) return;
    if (event.distanceMiles <= customDistance) counts.custom += 1;
    presets.forEach((preset) => {
      if (event.distanceMiles <= preset.miles) {
        counts.presets[preset.value] = (counts.presets[preset.value] || 0) + 1;
      }
    });
  });

  presets.forEach((preset) => {
    if (!(preset.value in counts.presets)) counts.presets[preset.value] = 0;
  });
  return counts;
}
