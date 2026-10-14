const EARTH_RADIUS = 6371008.8;
const radians = (degrees) => degrees * Math.PI / 180;
function longitudeDelta(a, b) {
  let delta = b - a;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return radians(delta);
}
export function measurementDistance(points, closed = false) {
  if (points.length < 2) return 0;
  const path = closed && points.length > 2 ? [...points, points[0]] : points;
  let meters = 0;
  for (let index = 1; index < path.length; index += 1) {
    const [lng1, lat1] = path[index - 1], [lng2, lat2] = path[index];
    const dLat = radians(lat2 - lat1), dLng = longitudeDelta(lng1, lng2);
    const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
    meters += 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
  }
  return meters;
}
export function measurementArea(points) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [lng1, lat1] = points[index], [lng2, lat2] = points[(index + 1) % points.length];
    area += longitudeDelta(lng1, lng2) * (2 + Math.sin(radians(lat1)) + Math.sin(radians(lat2)));
  }
  const sphereArea = 4 * Math.PI * EARTH_RADIUS ** 2;
  const result = Math.abs(area * EARTH_RADIUS ** 2 / 2);
  return Math.min(result, sphereArea - result);
}
