import { geometryCoordinates } from '../map-engine-utils.js';

export function cardCoverMode(entity, kind) {
  if (entity.cover_url) return 'custom';
  return kind === 'maps' && Number(entity.feature_count) > 0 ? 'map' : 'default';
}

export function visiblePreviewPositions(map) {
  return (map.layers || []).flatMap((layer) => layer.visible
    ? layer.features.flatMap((feature) => geometryCoordinates(feature.geometry))
    : []);
}

// Fit the initial view before creating the map, so a thumbnail never animates
// from the editor's saved viewport to its feature bounds.
export function previewViewport(map, width, height) {
  const positions = visiblePreviewPositions(map);
  if (!positions.length) return map;
  const projected = positions.map(([lng, lat]) => {
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return [(lng + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2];
  });
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const [x, y] of projected) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const zoom = Math.min(14,
    Math.log2(Math.max(1, width - 44) / (256 * Math.max(right - left, 1e-9))),
    Math.log2(Math.max(1, height - 50) / (256 * Math.max(bottom - top, 1e-9))));
  return {
    ...map,
    center_lng: (left + right) / 2 * 360 - 180,
    center_lat: Math.atan(Math.sinh(Math.PI * (1 - top - bottom))) * 180 / Math.PI,
    zoom: Math.max(2, zoom),
  };
}
