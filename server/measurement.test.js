import assert from 'node:assert/strict';
import test from 'node:test';
import { measurementArea, measurementDistance } from '../src/components/editor/measurement.js';

function approximately(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ± ${tolerance}, received ${actual}`);
}

// Reference values use the IUGG mean Earth radius, 6,371,008.8 m. Keeping the
// numerical oracles fixed avoids reproducing the production polygon/path loops.
test('one equatorial degree measures the known spherical arc length', () => {
  approximately(measurementDistance([[0, 0], [1, 0]]), 111_195.0802335, 0.0001, 'one-degree arc');
  approximately(measurementDistance([[0, 0], [90, 0]]), 10_007_557.221018, 0.001, 'quarter circumference');
});

test('closed perimeter includes the last-to-first edge exactly once', () => {
  const triangle = [[0, 0], [1, 0], [1, 1]];
  approximately(measurementDistance(triangle), 222_390.1604671, 0.0001, 'open two-edge path');
  approximately(measurementDistance(triangle, true), 379_639.7589412, 0.001, 'three-edge perimeter');
  approximately(measurementDistance([...triangle, triangle[0]], true), 379_639.7589412, 0.001, 'explicitly closed perimeter');
});

test('crossing the dateline takes the short arc instead of circling the world', () => {
  approximately(measurementDistance([[179.5, 0], [-179.5, 0]]), 111_195.0802335, 0.0001, 'dateline crossing');
  approximately(measurementDistance([[-179.5, 0], [179.5, 0]]), 111_195.0802335, 0.0001, 'reverse dateline crossing');
});

test('one-degree longitude-latitude rectangle has its known spherical strip area', () => {
  // Integral of a one-degree-wide spherical strip from latitude 0° to 1°.
  const rectangle = [[0, 0], [1, 0], [1, 1], [0, 1]];
  approximately(measurementArea(rectangle), 12_363_718_145.18, 1, 'equatorial rectangle area');
  approximately(measurementArea([...rectangle].reverse()), 12_363_718_145.18, 1, 'reversed rectangle area');
  approximately(measurementArea([...rectangle, rectangle[0]]), 12_363_718_145.18, 1, 'explicitly closed rectangle area');
});

test('rectangle area is unchanged by longitude translation across the dateline', () => {
  const rectangle = [[179.5, 0], [-179.5, 0], [-179.5, 1], [179.5, 1]];
  approximately(measurementArea(rectangle), 12_363_718_145.18, 1, 'dateline rectangle area');
  approximately(measurementArea([...rectangle].reverse()), 12_363_718_145.18, 1, 'reversed dateline rectangle');
});

test('insufficient points and repeated points have zero length or area', () => {
  for (const points of [[], [[10, 20]]]) {
    assert.equal(measurementDistance(points), 0);
    assert.equal(measurementDistance(points, true), 0);
    assert.equal(measurementArea(points), 0);
  }
  assert.equal(measurementArea([[10, 20], [11, 21]]), 0);
  assert.equal(measurementDistance([[10, 20], [10, 20]]), 0);
  assert.equal(measurementArea([[10, 20], [10, 20], [10, 20]]), 0);
});
