import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gcj02ToWgs84,
  toDisplayLatLng,
  toDisplayLngLat,
  toStorageLngLat,
  wgs84ToGcj02,
} from '../src/amap.js';

test('AMap display coordinates round-trip without moving stored WGS84 points', () => {
  const wgs84 = [121.48286819458009, 31.23217880603803];
  const gcj02 = wgs84ToGcj02(...wgs84);
  const restored = gcj02ToWgs84(...gcj02);

  assert.ok(Math.abs(restored[0] - wgs84[0]) < 1e-9);
  assert.ok(Math.abs(restored[1] - wgs84[1]) < 1e-9);
  assert.deepEqual(toDisplayLatLng(...wgs84), [gcj02[1], gcj02[0]]);
  assert.deepEqual(toDisplayLngLat(...wgs84), gcj02);
  assert.deepEqual(toStorageLngLat(...gcj02), restored);
});

test('coordinates outside China remain unchanged', () => {
  const coordinate = [-0.1276, 51.5072];
  assert.deepEqual(wgs84ToGcj02(...coordinate), coordinate);
  assert.deepEqual(gcj02ToWgs84(...coordinate), coordinate);
});
