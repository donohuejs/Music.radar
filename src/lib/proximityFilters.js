export const PROXIMITY_PRESETS = [
  { label: "Walkable", value: "walkable", minMiles: null, miles: 1.5, rangeLabel: "≤1.5 mi" },
  { label: "Short trip", value: "short-trip", minMiles: 1.5, miles: 5, rangeLabel: "1.5–5 mi" },
  { label: "Across town", value: "across-town", minMiles: 5, miles: 10, rangeLabel: "5–10 mi" },
  { label: "Farther out", value: "farther-out", minMiles: 10, miles: Infinity, rangeLabel: "10+ mi" },
];

function presetForRadius(preset, radius) {
  const miles = Math.min(preset.miles, radius);
  const rangeLabel = Number.isFinite(preset.minMiles)
    ? `${preset.minMiles}–${miles} mi`
    : `≤${miles} mi`;
  return { ...preset, miles, rangeLabel };
}

export function buildProximityModel(proximity, resultRadius) {
  const radius = Math.max(Number(resultRadius) || 1, 0.5);
  const availablePresets = PROXIMITY_PRESETS
    .filter((option) => radius > (option.minMiles || 0))
    .map((option) => presetForRadius(option, radius));
  const selectedOption = PROXIMITY_PRESETS.find((option) => option.value === proximity?.mode);
  const selectedPreset = selectedOption ? presetForRadius(selectedOption, radius) : null;
  const customDistance = Math.min(
    Math.max(Number(proximity?.customMiles) || 0.5, 0.5),
    radius,
  );
  const maxDistance = proximity?.mode === "custom"
    ? customDistance
    : proximity?.mode === "all"
      ? null
      : Math.min(selectedPreset?.miles || radius, radius);
  const minDistance = proximity?.mode === "custom" || proximity?.mode === "all"
    ? null
    : selectedPreset?.minMiles || null;
  const summary = proximity?.mode === "all"
    ? `All · ${radius} mi`
    : proximity?.mode === "custom"
      ? `Custom · ≤${customDistance} mi`
      : `${selectedPreset?.label || "Nearby"} · ${selectedPreset?.rangeLabel || `≤${maxDistance} mi`}`;

  return {
    availablePresets,
    customDistance,
    maxDistance,
    minDistance,
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
      if (
        (!Number.isFinite(preset.minMiles) || event.distanceMiles > preset.minMiles) &&
        event.distanceMiles <= preset.miles
      ) {
        counts.presets[preset.value] = (counts.presets[preset.value] || 0) + 1;
      }
    });
  });

  presets.forEach((preset) => {
    if (!(preset.value in counts.presets)) counts.presets[preset.value] = 0;
  });
  return counts;
}
