export function eventGeoCell(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${Math.floor(latitude)}:${Math.floor(longitude)}`;
}

export function searchGeoCells(latitude, longitude, radiusMiles) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

  const radius = Math.max(Number(radiusMiles) || 25, 1);
  const latitudeDelta = radius / 69;
  const longitudeMiles = Math.max(
    69 * Math.cos((latitude * Math.PI) / 180),
    10,
  );
  const longitudeDelta = radius / longitudeMiles;
  const cells = [];

  for (
    let latCell = Math.floor(latitude - latitudeDelta);
    latCell <= Math.floor(latitude + latitudeDelta);
    latCell += 1
  ) {
    for (
      let lngCell = Math.floor(longitude - longitudeDelta);
      lngCell <= Math.floor(longitude + longitudeDelta);
      lngCell += 1
    ) {
      cells.push(`${latCell}:${lngCell}`);
    }
  }

  return cells;
}
