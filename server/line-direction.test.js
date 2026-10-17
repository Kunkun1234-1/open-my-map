import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lineArrowLayout,
  normalizeLineDirection,
} from '../src/components/editor/line-direction.js';

test('normalizes direction to a rounded integer from -100 through 100', () => {
  assert.equal(normalizeLineDirection(28.6), 29);
  assert.equal(normalizeLineDirection(-28.6), -29);
  assert.equal(normalizeLineDirection(140), 100);
  assert.equal(normalizeLineDirection(-140), -100);
  assert.equal(normalizeLineDirection('42.4'), 42);
});

test('normalizes empty and non-finite direction values to zero', () => {
  assert.equal(normalizeLineDirection(null), 0);
  assert.equal(normalizeLineDirection(undefined), 0);
  assert.equal(normalizeLineDirection(''), 0);
  assert.equal(normalizeLineDirection(Number.NaN), 0);
  assert.equal(normalizeLineDirection(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeLineDirection('not a number'), 0);
});

test('positive direction places an outward arrow at the final endpoint of a bent path', () => {
  assert.deepEqual(lineArrowLayout([[0, 0], [20, 0], [20, 30]], 50), {
    tip: [20, 30],
    angle: 90,
    size: 20,
    end: 'end',
  });
});

test('negative direction places an outward arrow at the initial endpoint of a bent path', () => {
  assert.deepEqual(lineArrowLayout([[10, 10], [30, 10], [30, 40]], -50), {
    tip: [10, 10],
    angle: 180,
    size: 20,
    end: 'start',
  });
});

test('duplicate endpoint vertices use the nearest distinct vertex for orientation', () => {
  assert.deepEqual(lineArrowLayout([[2, 2], [2, 2], [12, 2]], -25), {
    tip: [2, 2],
    angle: 180,
    size: 12,
    end: 'start',
  });
  assert.deepEqual(lineArrowLayout([[2, 2], [12, 2], [12, 2]], 25), {
    tip: [12, 2],
    angle: 0,
    size: 12,
    end: 'end',
  });
});

test('neutral, degenerate, and invalid endpoint paths do not produce arrows', () => {
  assert.equal(lineArrowLayout([[0, 0], [10, 0]], 0), null);
  assert.equal(lineArrowLayout([], 10), null);
  assert.equal(lineArrowLayout([[0, 0]], 10), null);
  assert.equal(lineArrowLayout([[4, 4], [4, 4], [4, 4]], 10), null);
  assert.equal(lineArrowLayout([[0, 0], [Number.NaN, 2]], 10), null);
  assert.equal(lineArrowLayout([[Number.NaN, 2], [10, 0]], -10), null);
});

test('arrow size is monotonic, sign-symmetric, and capped by normalized direction', () => {
  const points = [[0, 0], [10, 0]];
  const smallPositive = lineArrowLayout(points, 20);
  const largePositive = lineArrowLayout(points, 80);
  const smallNegative = lineArrowLayout(points, -20);
  const largeNegative = lineArrowLayout(points, -80);

  assert.ok(smallPositive.size < largePositive.size);
  assert.equal(smallPositive.size, smallNegative.size);
  assert.equal(largePositive.size, largeNegative.size);
  assert.equal(lineArrowLayout(points, 1000).size, 36);
  assert.equal(lineArrowLayout(points, -1000).size, 36);
});
