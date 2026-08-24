export function countActiveRefinements({
  genre = "all",
  proximityMode = "all",
  query = "",
  sort = "date",
} = {}) {
  return [
    genre !== "all",
    proximityMode !== "all",
    Boolean(String(query).trim()),
    sort !== "date",
  ].filter(Boolean).length;
}
