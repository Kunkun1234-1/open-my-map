const MIN_DIRECTION = -100;
const MAX_DIRECTION = 100;

/**
 * Convert an arbitrary line-direction value to the persisted integer range.
 * Empty and non-finite values represent the neutral, arrow-free state.
 */
export function normalizeLineDirection(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(MAX_DIRECTION, Math.max(MIN_DIRECTION, Math.round(numeric)));
}

const validPoint = (point) => (
  Array.isArray(point)
  && point.length >= 2
  && Number.isFinite(point[0])
  && Number.isFinite(point[1])
);

const distinct = (left, right) => left[0] !== right[0] || left[1] !== right[1];

/**
 * Describe the endpoint arrow for a screen-space polyline.
 * Angles use screen coordinates: 0 points right and 90 points down.
 */
export function lineArrowLayout(points, direction) {
  const normalized = normalizeLineDirection(direction);
  if (normalized === 0 || !Array.isArray(points) || points.length < 2) return null;

  const positive = normalized > 0;
  const endpointIndex = positive ? points.length - 1 : 0;
  const tip = points[endpointIndex];
  if (!validPoint(tip)) return null;

  const step = positive ? -1 : 1;
  let neighbor = null;
  for (
    let index = endpointIndex + step;
    index >= 0 && index < points.length;
    index += step
  ) {
    const candidate = points[index];
    if (validPoint(candidate) && distinct(tip, candidate)) {
      neighbor = candidate;
      break;
    }
  }

  if (!neighbor) return null;

  const dx = tip[0] - neighbor[0];
  const dy = tip[1] - neighbor[1];
  return {
    tip: [tip[0], tip[1]],
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
    size: 4 + Math.abs(normalized) * 0.32,
    end: positive ? 'end' : 'start',
  };
}
