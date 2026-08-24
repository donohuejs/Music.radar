export function countActiveRefinements({
  genre = "all",
  proximityMode = "all",
  query = "",
  sort = "date",
  travelEnabled = false,
} = {}) {
  return [
    genre !== "all",
    travelEnabled || proximityMode !== "all",
    Boolean(String(query).trim()),
    sort !== "date",
  ].filter(Boolean).length;
}
