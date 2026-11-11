import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PREVIEW_SEARCH_RESULT_LIMIT,
  filterPreviewRecords,
  normalizePreviewSearch,
  previewRecordKind,
  previewRecordSearchText,
} from '../src/components/preview-search-utils.js';

const records = [
  {
    feature: { id: 1, name: '外滩观景平台', description: '江边夜景', type: 'Point' },
    layer: { id: 10, name: '周末地点' },
  },
  {
    feature: { id: 2, name: 'Riverside Walk', description: 'Coffee and photos', type: 'LineString' },
    layer: { id: 20, name: 'Walking Routes' },
  },
  {
    feature: { id: 3, name: '活动区', description: '草坪', type: 'Polygon' },
    layer: { id: 30, name: '北外滩' },
  },
];

test('preview search normalizes case, width and whitespace', () => {
  assert.equal(normalizePreviewSearch('  ＲＩＶＥＲＳＩＤＥ\n Walk  '), 'riverside walk');
  assert.equal(previewRecordSearchText(records[0]), '外滩观景平台 江边夜景 周末地点 point point');
});

test('preview search matches every token across names, descriptions and layers without mutating records', () => {
  const snapshot = structuredClone(records);
  assert.deepEqual(filterPreviewRecords(records, 'coffee routes'), [records[1]]);
  assert.deepEqual(filterPreviewRecords(records, '外滩 草坪'), [records[2]]);
  assert.deepEqual(filterPreviewRecords(records, '周末 江边'), [records[0]]);
  assert.deepEqual(records, snapshot);
});

test('empty searches retain source order and limits never mutate the source array', () => {
  const result = filterPreviewRecords(records, '', 2);
  assert.deepEqual(result, records.slice(0, 2));
  assert.notEqual(result, records);
  assert.deepEqual(filterPreviewRecords(records, '', 0), []);
  assert.equal(PREVIEW_SEARCH_RESULT_LIMIT, 50);
});

test('malformed records are ignored and geometry kinds stay presentation-friendly', () => {
  assert.deepEqual(filterPreviewRecords([null, {}, ...records], 'point'), [records[0]]);
  assert.equal(previewRecordKind(records[0].feature), 'point');
  assert.equal(previewRecordKind(records[1].feature), 'line');
  assert.equal(previewRecordKind(records[2].feature), 'area');
  assert.equal(previewRecordKind({ type: 'GeometryCollection' }), 'record');
});

test('PreviewSearch keeps its inert shell mounted and exposes the integration contract', () => {
  const source = readFileSync(new URL('../src/components/PreviewSearch.jsx', import.meta.url), 'utf8');
  assert.match(source, /id="preview-search"/);
  assert.match(source, /className=\{'preview-search' \+ \(open \? ' is-open' : ''\)\}/);
  assert.match(source, /inert=\{!open\}/);
  assert.match(source, /onSelect\?\.\(record\.feature\)/);
  assert.match(source, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(source, /onCompositionStart/);
  assert.match(source, /nativeEvent\.keyCode === 229/);
});
