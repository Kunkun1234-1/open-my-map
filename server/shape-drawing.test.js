import assert from 'node:assert/strict';
import test from 'node:test';
import { measurementDistance } from '../src/components/editor/measurement.js';
import {
  SHAPE_TOOLS,
  circleGeometry,
  draftShapeGeometry,
  polygonGeometry,
  rectangleGeometry,
} from '../src/components/editor/shape-drawing.js';

test('exports the three drawing modes in toolbar order', () => {
  assert.deepEqual(SHAPE_TOOLS, ['polygon', 'rectangle', 'circle']);
});

test('rectangle uses opposite corners without assuming drag direction', () => {
  const forward = rectangleGeometry([2, 5], [-3, -1]);
  const reverse = rectangleGeometry([-3, -1], [2, 5]);
  assert.equal(forward.type, 'Polygon');
  assert.equal(forward.coordinates[0].length, 5);
  assert.deepEqual(forward.coordinates[0][0], forward.coordinates[0].at(-1));
  const cornerSet = (geometry) => new Set(geometry.coordinates[0].slice(0, -1).map((point) => point.join(',')));
  assert.deepEqual(cornerSet(forward), cornerSet(reverse));
  assert.deepEqual(cornerSet(forward), new Set(['2,5', '-3,5', '-3,-1', '2,-1']));
});

test('rectangle rejects zero-area and non-finite input', () => {
  assert.equal(rectangleGeometry([1, 1], [1, 2]), null);
  assert.equal(rectangleGeometry([1, 1], [2, 1]), null);
  assert.equal(rectangleGeometry([1, 1], [Number.NaN, 2]), null);
  assert.equal(rectangleGeometry([1, 91], [2, 2]), null);
  assert.equal(rectangleGeometry([1, -91], [2, 2]), null);
  assert.equal(rectangleGeometry([180, 1], [-180, 2]), null);
});

test('circle has a closed 64-segment ring whose vertices share one spherical radius', () => {
  const center = [120, 30];
  const geometry = circleGeometry(center, [120.2, 30]);
  const ring = geometry.coordinates[0];
  assert.equal(ring.length, 65);
  assert.deepEqual(ring[0], ring.at(-1));
  const expectedRadius = measurementDistance([center, [120.2, 30]]);
  for (const point of ring.slice(0, -1).filter((_, index) => index % 8 === 0)) {
    assert.ok(Math.abs(measurementDistance([center, point]) - expectedRadius) < 1e-6);
  }
});

test('circle wraps safely across the dateline and rejects degenerate input', () => {
  const geometry = circleGeometry([179.9, 10], [-179.8, 10], 32);
  const ring = geometry.coordinates[0];
  assert.equal(ring.length, 33);
  assert.ok(ring.every(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude)));
  assert.ok(ring.every(([longitude]) => longitude >= -180 && longitude <= 180));
  assert.ok(ring.some(([longitude]) => longitude < 0));
  assert.ok(ring.some(([longitude]) => longitude > 0));
  assert.equal(circleGeometry([0, 0], [0, 0]), null);
  assert.equal(circleGeometry([0, 0], [1, Number.POSITIVE_INFINITY]), null);
  assert.equal(circleGeometry([0, 0], [1, 0], 2), null);
});

test('polygon removes adjacent duplicates and closes an existing ring once', () => {
  const geometry = polygonGeometry([[0, 0], [1, 0], [1, 0], [1, 1], [0, 0]]);
  assert.deepEqual(geometry.coordinates[0], [[0, 0], [1, 0], [1, 1], [0, 0]]);
});

test('polygon validates independent non-collinear vertices across the dateline', () => {
  assert.ok(polygonGeometry([[179, 0], [-179, 0], [-179, 2], [179, 2]]));
  assert.ok(polygonGeometry([[0, 0], [0.00001, 0], [0, 0.00001]]));
  assert.equal(polygonGeometry([[0, 0], [0.00001, 0.00001], [0.00002, 0.00002]]), null);
  assert.equal(polygonGeometry([[0, 0], [1, 1], [2, 2]]), null);
  assert.equal(polygonGeometry([[0, 0], [1, 0], [0, 0], [1, 0]]), null);
  assert.equal(polygonGeometry([[0, 0], [1, 0], [Number.NaN, 1]]), null);
  assert.equal(polygonGeometry([[0, 0], [1, 0], [0, 90.1]]), null);
});

test('draft geometry uses the hover point for standard shapes and polygon previews', () => {
  assert.deepEqual(
    draftShapeGeometry('rectangle', [[0, 0]], [2, 1]),
    rectangleGeometry([0, 0], [2, 1]),
  );
  assert.deepEqual(
    draftShapeGeometry('circle', [[0, 0]], [0.1, 0]),
    circleGeometry([0, 0], [0.1, 0]),
  );
  assert.deepEqual(
    draftShapeGeometry('polygon', [[0, 0], [2, 0]], [1, 1]),
    polygonGeometry([[0, 0], [2, 0], [1, 1]]),
  );
  assert.equal(draftShapeGeometry('polygon', [[0, 0], [1, 0]]), null);
  assert.equal(draftShapeGeometry('unknown', [[0, 0]], [1, 1]), null);
});
