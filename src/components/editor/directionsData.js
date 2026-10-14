import { MAX_ROUTE_STOPS, ROUTE_MODES, splitRouteAtStops, validRoutePosition } from '../../routing.js';

function validPath(path, minimumLength = 2) {
  return Array.isArray(path) && path.length >= minimumLength && path.every(validRoutePosition);
}

function storedGeometry(routeData, feature) {
  const geometry = feature?.geometry || routeData.geometry;
  if (geometry?.type === 'LineString' && validPath(geometry.coordinates)) {
    return { type: 'LineString', coordinates: geometry.coordinates.map((point) => point.slice(0, 2).map(Number)) };
  }
  const paths = Array.isArray(routeData.segmentPaths) && routeData.segmentPaths.length
    ? routeData.segmentPaths : Array.isArray(routeData.steps) ? routeData.steps.map((step) => step.path) : [];
  if (!paths.length || !paths.every((path) => validPath(path, 1))) return null;
  const coordinates = [];
  for (const path of paths) for (const value of path) {
    const point = value.slice(0, 2).map(Number);
    const previous = coordinates.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) coordinates.push(point);
  }
  return validPath(coordinates) ? { type: 'LineString', coordinates } : null;
}

/** Restore stored WGS84 route data without requiring a new online request. */
export function restoreSavedDirections(routeData, feature) {
  if (!routeData || !ROUTE_MODES.includes(routeData.mode) || !Array.isArray(routeData.stops)
    || routeData.stops.length < 2 || routeData.stops.length > MAX_ROUTE_STOPS
    || routeData.stops.some((stop) => !validRoutePosition(stop?.position))) {
    throw new Error('该路线缺少有效起终点信息，请重新规划。');
  }
  const stops = routeData.stops.map((stop) => ({
    text: String(stop.text || stop.name || ''), address: String(stop.address || ''), position: stop.position.slice(0, 2).map(Number),
  }));
  const geometry = storedGeometry(routeData, feature);
  const distance = Number(routeData.distance);
  const duration = Number(routeData.duration);
  const index = Math.max(0, Math.floor(Number(routeData.selectedAlternativeIndex) || 0));
  const route = geometry && Number.isFinite(distance) && distance >= 0 && Number.isFinite(duration) && duration >= 0 ? {
    id: `route-${index}`,
    mode: routeData.mode,
    sourceAlternativeIndex: index,
    geometry,
    distance,
    duration,
    steps: Array.isArray(routeData.steps) ? JSON.parse(JSON.stringify(routeData.steps)) : [],
    segmentPaths: Array.isArray(routeData.segmentPaths) && routeData.segmentPaths.length === stops.length - 1 && routeData.segmentPaths.every((path) => validPath(path, 1))
      ? routeData.segmentPaths.map((path) => path.map((point) => point.slice(0, 2).map(Number)))
      : splitRouteAtStops(geometry.coordinates, stops.map((stop) => stop.position)),
  } : null;
  return { mode: routeData.mode, stops, route };
}

export function directionsSnapshotSignature(mode, stops, route) {
  if (!route) return '';
  return JSON.stringify({
    mode,
    stops: stops.map((stop) => ({ text: String(stop.text || ''), address: String(stop.address || ''), position: stop.position })),
    geometry: route.geometry,
    alternativeIndex: route.sourceAlternativeIndex ?? (Number(String(route.id).split('-').at(-1)) || 0),
    distance: route.distance,
    duration: route.duration,
  });
}
