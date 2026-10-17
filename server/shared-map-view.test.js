import test from 'node:test';
import assert from 'node:assert/strict';
import { moveStoryRecord, orderStoryRecords, sharedMapLayers, sharedPresentationLayers } from '../src/components/shared-map-utils.js';

const layers = [
  { id: 1, name: '建筑', visible: true, features: [{ id: 11, name: '钟楼', description: 'Big Ben by the river' }, { id: 12, name: '博物馆', description: '' }] },
  { id: 2, name: '散步路线', visible: false, features: [{ id: 21, name: '河畔', description: '风景' }] },
];

test('shared map search matches name, description and layer with trimmed case-insensitive text', () => {
  assert.deepEqual(sharedMapLayers(layers, '  BIG BEN  ', { 1: true, 2: true })[0].features.map((feature) => feature.id), [11]);
  assert.deepEqual(sharedMapLayers(layers, '博物', { 1: true })[0].features.map((feature) => feature.id), [12]);
  assert.equal(sharedMapLayers(layers, '路线', { 2: true })[1].features.length, 1);
  assert.ok(sharedMapLayers(layers, 'missing', { 1: true }).every((layer) => layer.features.length === 0));
});

test('search keeps hidden layers hidden and never changes the shared map source', () => {
  const before = JSON.stringify(layers);
  const result = sharedMapLayers(layers, '   ', { 1: false, 2: true });
  assert.equal(result[0].visible, false);
  assert.equal(result[1].visible, true);
  assert.equal(result[0].features.length, 2);
  assert.equal(JSON.stringify(layers), before);
});

test('new and updated source layers follow shared visibility until a visitor overrides it', () => {
  assert.deepEqual(sharedMapLayers(layers, '', {}).map((layer) => layer.visible), [true, false]);
  const updated = [...layers, { id: 3, name: '新图层', visible: true, features: [] }];
  assert.deepEqual(sharedMapLayers(updated, '', { 1: false }).map((layer) => layer.visible), [false, false, true]);
});

test('preview overlay enhancements leave saved styles, geometry and route metadata intact', () => {
  const routeData = { mode: 'walking', stops: [{ name: '起点', coordinates: [121, 31] }] };
  const source = [{ id: 7, visible: true, style: { color: '#e85d4a', weight: 2 }, features: [
    { id: 71, type: 'LineString', geometry: { type: 'LineString', coordinates: [[121, 31], [121.1, 31.1]] }, style: { routeData, opacity: 0.7 } },
    { id: 72, type: 'Polygon', geometry: { type: 'Polygon', coordinates: [] }, style: { fillOpacity: 0 } },
    { id: 73, type: 'Point', style: { icon: 'star', color: '#8e24aa' } },
  ] }];
  const before = JSON.stringify(source);
  const [route, area, point] = sharedPresentationLayers(source)[0].features;
  assert.equal(route.style.color, '#EF4444');
  assert.equal(route.style.weight, 5);
  assert.equal(route.style.isOutline, true);
  assert.equal(route.style.opacity, 0.7);
  assert.equal(route.style.routeData, routeData);
  assert.equal(route.geometry, source[0].features[0].geometry);
  assert.equal(area.style.fillOpacity, 0);
  assert.equal(point, source[0].features[2]);
  assert.equal(JSON.stringify(source), before);
});

test('story records cross layer boundaries, discard stale IDs and append new records without changing the source', () => {
  const records = layers.flatMap((layer) => layer.features.map((feature) => ({ feature, layer })));
  const before = JSON.stringify(records);
  assert.deepEqual(orderStoryRecords(records, [21, 999, 11, 21]).map(({ feature }) => feature.id), [21, 11, 12]);
  assert.deepEqual(orderStoryRecords(records.filter(({ feature }) => feature.id !== 21), [21, 12, 11]).map(({ feature }) => feature.id), [12, 11]);
  assert.deepEqual(orderStoryRecords(records, null).map(({ feature }) => feature.id), [11, 12, 21]);
  assert.equal(JSON.stringify(records), before);
});

test('story moves support both directions and ignore invalid drops without mutating the saved sequence', () => {
  const ids = [11, 12, 21];
  assert.deepEqual(moveStoryRecord(ids, 11, 21), [12, 21, 11]);
  assert.deepEqual(moveStoryRecord(ids, 21, 11), [21, 11, 12]);
  assert.equal(moveStoryRecord(ids, 999, 11), ids);
  assert.equal(moveStoryRecord(ids, 12, 12), ids);
  assert.deepEqual(ids, [11, 12, 21]);
});
