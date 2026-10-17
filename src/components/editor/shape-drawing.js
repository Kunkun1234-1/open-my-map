import { measurementDistance } from './measurement.js';

const EARTH_RADIUS = 6371008.8;
const COORDINATE_EPSILON = 1e-9;
const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (angle) => angle * 180 / Math.PI;

export const SHAPE_TOOLS = Object.freeze(['polygon', 'rectangle', 'circle']);

function validPoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && point[1] >= -90
    && point[1] <= 90;
}

function wrapLongitude(longitude) {
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

function longitudeDelta(first, second) {
  let delta = wrapLongitude(second) - wrapLongitude(first);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function samePoint(first, second) {
  return Math.abs(first[1] - second[1]) <= COORDINATE_EPSILON
    && Math.abs(longitudeDelta(first[0], second[0])) <= COORDINATE_EPSILON;
}

function polygon(coordinates) {
  return { type: 'Polygon', coordinates: [coordinates] };
}

export function rectangleGeometry(first, opposite) {
  if (!validPoint(first) || !validPoint(opposite)) return null;
  const firstLng = wrapLongitude(first[0]);
  const oppositeLng = wrapLongitude(opposite[0]);
  if (Math.abs(longitudeDelta(firstLng, oppositeLng)) <= COORDINATE_EPSILON
    || Math.abs(first[1] - opposite[1]) <= COORDINATE_EPSILON) return null;
  const ring = [
    [firstLng, first[1]],
    [oppositeLng, first[1]],
    [oppositeLng, opposite[1]],
    [firstLng, opposite[1]],
  ];
  ring.push([...ring[0]]);
  return polygon(ring);
}

export function circleGeometry(center, edge, segments = 64) {
  if (!validPoint(center) || !validPoint(edge)
    || !Number.isInteger(segments) || segments < 3) return null;
  const radius = measurementDistance([center, edge]);
  if (!Number.isFinite(radius) || radius <= EARTH_RADIUS * radians(COORDINATE_EPSILON)) return null;

  const centerLatitude = radians(center[1]);
  const centerLongitude = radians(wrapLongitude(center[0]));
  const angularRadius = radius / EARTH_RADIUS;
  const sinCenterLatitude = Math.sin(centerLatitude);
  const cosCenterLatitude = Math.cos(centerLatitude);
  const sinRadius = Math.sin(angularRadius);
  const cosRadius = Math.cos(angularRadius);
  const ring = [];

  for (let index = 0; index < segments; index += 1) {
    const bearing = 2 * Math.PI * index / segments;
    const latitude = Math.asin(Math.max(-1, Math.min(1,
      sinCenterLatitude * cosRadius + cosCenterLatitude * sinRadius * Math.cos(bearing),
    )));
    const longitude = centerLongitude + Math.atan2(
      Math.sin(bearing) * sinRadius * cosCenterLatitude,
      cosRadius - sinCenterLatitude * Math.sin(latitude),
    );
    const point = [wrapLongitude(degrees(longitude)), degrees(latitude)];
    if (!point.every(Number.isFinite)) return null;
    ring.push(point);
  }
  ring.push([...ring[0]]);
  return polygon(ring);
}

function hasThreeNonCollinearPoints(points) {
  const unwrapped = [[wrapLongitude(points[0][0]), points[0][1]]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = unwrapped[index - 1];
    unwrapped.push([
      previous[0] + longitudeDelta(points[index - 1][0], points[index][0]),
      points[index][1],
    ]);
  }

  const first = unwrapped[0];
  const second = unwrapped.find((point) => !samePoint(first, point));
  if (!second) return false;
  const dx = second[0] - first[0];
  const dy = second[1] - first[1];
  const scale = Math.max(COORDINATE_EPSILON, Math.abs(dx), Math.abs(dy));
  return unwrapped.some((point) => Math.abs(dx * (point[1] - first[1]) - dy * (point[0] - first[0])) > COORDINATE_EPSILON * scale);
}

export function polygonGeometry(points) {
  if (!Array.isArray(points) || points.some((point) => !validPoint(point))) return null;
  const cleaned = [];
  for (const point of points) {
    const normalized = [wrapLongitude(point[0]), point[1]];
    if (!cleaned.length || !samePoint(cleaned.at(-1), normalized)) cleaned.push(normalized);
  }
  while (cleaned.length > 1 && samePoint(cleaned.at(-1), cleaned[0])) cleaned.pop();
  const distinct = [];
  for (const point of cleaned) {
    if (!distinct.some((candidate) => samePoint(candidate, point))) distinct.push(point);
  }
  if (distinct.length < 3 || !hasThreeNonCollinearPoints(cleaned)) return null;
  const ring = cleaned.map((point) => [...point]);
  ring.push([...ring[0]]);
  return polygon(ring);
}

export function draftShapeGeometry(tool, points, hoverPoint) {
  if (!Array.isArray(points)) return null;
  if (tool === 'rectangle') return rectangleGeometry(points[0], hoverPoint || points[1]);
  if (tool === 'circle') return circleGeometry(points[0], hoverPoint || points[1]);
  if (tool !== 'polygon') return null;
  return polygonGeometry(hoverPoint ? [...points, hoverPoint] : points);
}
