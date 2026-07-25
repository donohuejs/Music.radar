export function distanceMiles(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;

  const [aLat, aLng, bLat, bLng] = values;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;

  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) *
      Math.cos(toRadians(bLat)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
