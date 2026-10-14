const DEGREES_TO_RADIANS = Math.PI / 180;

function coordinate(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

/** Return finite two-dimensional WGS84 positions without changing the input. */
export function geometryCoordinates(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  let positions;
  if (geometry.type === 'Point') positions = [geometry.coordinates];
  else if (geometry.type === 'LineString') positions = geometry.coordinates;
  else if (geometry.type === 'Polygon') positions = geometry.coordinates.flatMap((ring) => Array.isArray(ring) ? ring : []);
  else return [];
  return positions.map(coordinate).filter(Boolean);
}

function projectToSegment(start, end, point) {
  // A local equirectangular plane keeps longitude and latitude in comparable
  // units. The result is a projection hint, never replacement route geometry.
  const longitudeScale = Math.max(1e-8, Math.cos((start[1] + end[1] + point[1]) / 3 * DEGREES_TO_RADIANS));
  const dx = (end[0] - start[0]) * longitudeScale;
  const dy = end[1] - start[1];
  const px = (point[0] - start[0]) * longitudeScale;
  const py = point[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared)) : 0;
  return {
    fraction,
    distanceSquared: (px - fraction * dx) ** 2 + (py - fraction * dy) ** 2,
    position: [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction],
  };
}

function nearestProjection(path, point, minimumProgress = 0) {
  let best = null;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = coordinate(path[index]);
    const end = coordinate(path[index + 1]);
    if (!start || !end || index + 1 < minimumProgress) continue;
    const projected = projectToSegment(start, end, point);
    const minimumFraction = Math.max(0, minimumProgress - index);
    if (projected.fraction < minimumFraction) {
      projected.fraction = minimumFraction;
      projected.position = [start[0] + (end[0] - start[0]) * minimumFraction, start[1] + (end[1] - start[1]) * minimumFraction];
      const scale = Math.max(1e-8, Math.cos(point[1] * DEGREES_TO_RADIANS));
      projected.distanceSquared = ((point[0] - projected.position[0]) * scale) ** 2 + (point[1] - projected.position[1]) ** 2;
    }
    if (!best || projected.distanceSquared < best.distanceSquared) {
      best = { ...projected, pathIndex: index, progress: index + projected.fraction };
    }
  }
  // A single point (or a malformed path with no intact segment) is still a
  // valid position, but must not create a segment across invalid coordinates.
  if (!best) {
    path.forEach((value, index) => {
      const position = coordinate(value);
      if (!position || index < minimumProgress) return;
      const projected = projectToSegment(position, position, point);
      if (!best || projected.distanceSquared < best.distanceSquared) {
        best = { ...projected, pathIndex: index, progress: index };
      }
    });
  }
  return best;
}

/**
 * Locate a drag point on an existing route. pathIndex is the original path's
 * segment start index; segmentIndex identifies the consecutive stops leg.
 * Consumers must send position to the routing service to obtain a new route.
 */
export function nearestRouteSegment(pathWGS84, pointWGS84, stopsWGS84 = []) {
  const point = coordinate(pointWGS84);
  if (!Array.isArray(pathWGS84) || !point) return null;
  const nearest = nearestProjection(pathWGS84, point);
  if (!nearest) return null;

  const stops = Array.isArray(stopsWGS84) ? stopsWGS84.map(coordinate).filter(Boolean) : [];
  let segmentIndex = 0;
  let progress = 0;
  for (let index = 1; index < stops.length - 1; index += 1) {
    const projected = nearestProjection(pathWGS84, stops[index], progress);
    if (!projected) break;
    progress = projected.progress;
    if (nearest.progress >= progress) segmentIndex = index;
  }
  return { segmentIndex, pathIndex: nearest.pathIndex, position: nearest.position };
}

function lngLat(value) {
  if (!value) return null;
  if (Array.isArray(value)) return coordinate(value);
  try {
    return coordinate([
      typeof value.getLng === 'function' ? value.getLng() : value.lng,
      typeof value.getLat === 'function' ? value.getLat() : value.lat,
    ]);
  } catch {
    return null;
  }
}

/** Convert SDK bounds to finite storage-coordinate bounds, or null. */
export function safeStorageBounds(rawBounds, toStorageLngLat) {
  if (!rawBounds || typeof toStorageLngLat !== 'function') return null;
  try {
    const southwest = lngLat(typeof rawBounds.getSouthWest === 'function' ? rawBounds.getSouthWest() : rawBounds.sw);
    const northeast = lngLat(typeof rawBounds.getNorthEast === 'function' ? rawBounds.getNorthEast() : rawBounds.ne);
    if (!southwest || !northeast) return null;
    const sw = lngLat(toStorageLngLat(southwest[0], southwest[1]));
    const ne = lngLat(toStorageLngLat(northeast[0], northeast[1]));
    if (!sw || !ne) return null;
    return { west: sw[0], south: Math.min(sw[1], ne[1]), east: ne[0], north: Math.max(sw[1], ne[1]) };
  } catch {
    return null;
  }
}

/** Fit-view padding in SDK order: top, right, bottom, left. */
export function viewportPadding(container) {
  const padding = [40, 60, 40, 40];
  if (!container || typeof container.getBoundingClientRect !== 'function') return padding;
  const mapRect = container.getBoundingClientRect();
  const width = mapRect.width ?? mapRect.right - mapRect.left;
  const height = mapRect.height ?? mapRect.bottom - mapRect.top;
  if (!(width > 0 && height > 0)) return padding;
  const root = container.closest?.('.editor-page, .public-map-page, .preview-editor-page') || container.parentElement || container;
  const selector = '.editor-sidebar, .public-view-panel';
  const panels = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [root.querySelector?.(selector)].filter(Boolean);
  const getStyle = container.ownerDocument?.defaultView?.getComputedStyle;
  const gap = 16;

  for (const panel of panels) {
    if (panel.hidden || panel.classList?.contains('collapsed') || panel.getAttribute?.('aria-hidden') === 'true') continue;
    const style = getStyle?.call(container.ownerDocument.defaultView, panel);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) continue;
    if (typeof panel.getBoundingClientRect !== 'function') continue;
    const panelRect = panel.getBoundingClientRect();
    const left = Math.max(mapRect.left, panelRect.left);
    const right = Math.min(mapRect.right, panelRect.right);
    const top = Math.max(mapRect.top, panelRect.top);
    const bottom = Math.min(mapRect.bottom, panelRect.bottom);
    if (!(right - left > 8 && bottom - top > 8)) continue;
    // Test actual rendered placement, so a translated-offscreen mobile drawer
    // reserves no space. A wide panel docked in the lower map is a bottom sheet.
    const mobile = width <= 760;
    const bottomSheet = mobile && right - left >= width * 0.65
      && top > mapRect.top + height * 0.2 && panelRect.bottom >= mapRect.bottom - 40;
    if (bottomSheet) padding[2] = Math.max(padding[2], mapRect.bottom - top + gap);
    else if (left <= mapRect.left + 40) padding[3] = Math.max(padding[3], right - mapRect.left + gap);
  }
  padding[2] = Math.min(padding[2], Math.max(40, height - padding[0] - 60));
  padding[3] = Math.min(padding[3], Math.max(40, width - padding[1] - 60));
  return padding.map(Math.ceil);
}
