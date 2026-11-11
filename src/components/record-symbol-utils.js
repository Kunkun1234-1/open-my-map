import { getMarkerIcon, MARKER_ICON_IDS } from './marker-icons.js';

export function recordSymbolStyle(feature, layer) {
  const icon = [feature.style?.icon, layer.style?.icon, 'pin'].find((value) => MARKER_ICON_IDS.has(value));
  const color = feature.style?.color || layer.style?.color || '#1a73e8';
  return {
    icon: getMarkerIcon(icon).id,
    color,
    fillColor: feature.style?.fillColor || layer.style?.fillColor || color,
    fillOpacity: feature.style?.fillOpacity ?? layer.style?.fillOpacity ?? .28,
  };
}

// Fit the saved geometry into a 24px glyph, keeping north up and its map proportions.
export function recordGeometryPath(geometry) {
  const polygon = geometry?.type === 'Polygon';
  if (!polygon && geometry?.type !== 'LineString') return '';
  const rings = polygon ? geometry.coordinates : [geometry.coordinates];
  if (!Array.isArray(rings) || !rings.length) return '';
  const origin = rings[0]?.[0]?.[0];
  if (!Number.isFinite(origin)) return '';
  const paths = [];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < (polygon ? 3 : 2)) return '';
    const path = [];
    for (const point of ring) {
      if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return '';
      const longitude = origin + ((point[0] - origin + 540) % 360) - 180;
      const latitude = Math.max(-85.05, Math.min(85.05, point[1])) * Math.PI / 180;
      path.push([longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude / 2))]);
    }
    paths.push(path);
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const path of paths) for (const [x, y] of path) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!span) return '';
  const scale = 18 / span;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return paths.map((path) => path.map(([x, y], index) =>
    `${index ? 'L' : 'M'}${(12 + (x - centerX) * scale).toFixed(2)},${(12 + (y - centerY) * scale).toFixed(2)}`,
  ).join(' ') + (polygon ? ' Z' : '')).join(' ');
}
