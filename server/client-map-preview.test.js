import test from 'node:test';
import assert from 'node:assert/strict';
import { cardCoverMode, visiblePreviewPositions, previewViewport } from '../src/components/library/mapPreview.js';

test('map cards prefer a chosen cover, otherwise preview populated maps and keep defaults for empty maps and projects', () => {
  assert.equal(cardCoverMode({ feature_count: 0 }, 'maps'), 'default');
  assert.equal(cardCoverMode({ feature_count: 4 }, 'maps'), 'map');
  assert.equal(cardCoverMode({ feature_count: 4, cover_url: '/protected/cover' }, 'maps'), 'custom');
  assert.equal(cardCoverMode({ feature_count: 0, cover_url: '/protected/cover' }, 'maps'), 'custom');
  assert.equal(cardCoverMode({ feature_count: 4, cover_url: null }, 'maps'), 'map');
  assert.equal(cardCoverMode({ feature_count: 4 }, 'projects'), 'default');
});

test('thumbnail viewport fits all visible geometry at card size without changing the saved view', () => {
  const map = { center_lng: 0, center_lat: 0, zoom: 2, layers: [{ visible: true, features: [
    { geometry: { type: 'LineString', coordinates: [[121.46, 31.22], [121.49, 31.24]] } },
  ] }] };
  const preview = previewViewport(map, 320, 140);
  assert.ok(Math.abs(preview.center_lng - 121.475) < .0001);
  assert.ok(Math.abs(preview.center_lat - 31.23) < .0001);
  assert.ok(preview.zoom > 11 && preview.zoom < 14);
  assert.ok(previewViewport(map, 170, 100).zoom < preview.zoom);
  assert.equal(map.zoom, 2);
  const hidden = { ...map, layers: [{ ...map.layers[0], visible: false }] };
  assert.equal(previewViewport(hidden, 320, 140), hidden);
  assert.equal(previewViewport({ layers: [{ visible: true, features: [{ geometry: { type: 'Point', coordinates: [121, 31] } }] }] }, 320, 140).zoom, 14);
});

test('preview bounds use visible points, routes and polygon rings and ignore malformed positions', () => {
  const point = { geometry: { type: 'Point', coordinates: [121, 31] } };
  const route = { geometry: { type: 'LineString', coordinates: [[121.1, 31.1], [121.2, 31.2], [999, 31]] } };
  const polygon = { geometry: { type: 'Polygon', coordinates: [[[120, 30], [120.1, 30], [120.1, 30.1], [120, 30]]] } };
  const map = { layers: [
    { visible: true, features: [point, route, polygon] },
    { visible: false, features: [{ geometry: { type: 'Point', coordinates: [1, 1] } }] },
  ] };
  const before = structuredClone(map);
  assert.deepEqual(visiblePreviewPositions(map), [[121, 31], [121.1, 31.1], [121.2, 31.2], [120, 30], [120.1, 30], [120.1, 30.1], [120, 30]]);
  assert.deepEqual(map, before);
  assert.deepEqual(visiblePreviewPositions({ layers: [{ visible: false, features: [point] }] }), []);
});
