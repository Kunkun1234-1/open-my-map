import assert from 'node:assert/strict';
import test from 'node:test';
import Papa from 'papaparse';
import {
  layerCsv, tableCustomFieldId, tableFieldValue,
} from '../src/table-data.js';
import { exportCsv, mapToGeoJson } from '../src/utils.js';

test('table field helpers distinguish built-in and safe custom fields', () => {
  const feature = {
    name: 'Named',
    description: null,
    properties: { col_owner: '王老师', col_code: '00123', col_zero: 0 },
  };
  assert.equal(tableCustomFieldId('data:col_owner'), 'col_owner');
  assert.equal(tableCustomFieldId('data:col_550e8400-e29b-41d4-a716-446655440000'), 'col_550e8400-e29b-41d4-a716-446655440000');
  assert.equal(tableCustomFieldId('name'), null);
  assert.equal(tableCustomFieldId('data:owner'), null);
  assert.equal(tableCustomFieldId('data:col_bad:value'), null);
  assert.equal(tableFieldValue(feature, 'name'), 'Named');
  assert.equal(tableFieldValue(feature, 'description'), '');
  assert.equal(tableFieldValue(feature, 'data:col_owner'), '王老师');
  assert.equal(tableFieldValue(feature, 'data:col_code'), '00123');
  assert.equal(tableFieldValue(feature, 'data:col_zero'), '0');
  assert.equal(tableFieldValue(feature, 'data:col_missing'), '');
});

test('layer CSV keeps schema order, empty cells, unicode, quoting, and leading zeros', () => {
  const geometry = { type: 'Point', coordinates: [121.5, 31.2] };
  const csv = layerCsv({
    columns: [
      { id: 'col_owner', name: '负责人' },
      { id: 'col_code', name: '编号' },
      { id: 'unsafe', name: '忽略' },
    ],
    features: [
      {
        name: '地点, "一"\n下一行',
        description: '说明',
        type: 'Point',
        geometry,
        properties: { col_owner: '王,"小\n明"', col_code: '00123' },
      },
      {
        name: '空值',
        description: '',
        type: 'LineString',
        geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
        properties: {},
      },
    ],
  });
  const parsed = Papa.parse(csv).data;
  assert.deepEqual(parsed[0], ['name', 'description', '负责人', '编号', 'type', 'longitude', 'latitude', 'geometry']);
  assert.deepEqual(parsed[1], [
    '地点, "一"\n下一行', '说明', '王,"小\n明"', '00123', 'Point', '121.5', '31.2', JSON.stringify(geometry),
  ]);
  assert.deepEqual(parsed[2], [
    '空值', '', '', '', 'LineString', '', '', JSON.stringify({ type: 'LineString', coordinates: [[1, 2], [3, 4]] }),
  ]);
  assert.match(csv, /"地点, ""一""\n下一行"/);
  assert.match(csv, /"王,""小\n明"""/);
});

test('empty layers still export stable built-in and custom headers', () => {
  assert.equal(
    layerCsv({ columns: [], features: [] }),
    'name,description,type,longitude,latitude,geometry\r\n',
  );
  assert.equal(
    layerCsv({ columns: [{ id: 'col_owner', name: '负责人' }], features: [] }),
    'name,description,负责人,type,longitude,latitude,geometry\r\n',
  );
});

test('CSV download adds an Excel-friendly UTF-8 BOM', async () => {
  const originalDocument = globalThis.document;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let downloadedBlob;
  let downloadedName;
  try {
    URL.createObjectURL = (blob) => { downloadedBlob = blob; return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    globalThis.document = {
      createElement: () => ({
        click() {},
        set href(_value) {},
        set download(value) { downloadedName = value; },
      }),
    };
    exportCsv({ name: '中文图层', columns: [], features: [] });
    assert.equal(downloadedName, '中文图层.csv');
    assert.equal(downloadedBlob.type, 'text/csv;charset=utf-8');
    const bytes = new Uint8Array(await downloadedBlob.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(await downloadedBlob.text(), 'name,description,type,longitude,latitude,geometry\r\n');
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test('GeoJSON includes custom display names without overriding reserved properties', () => {
  const exported = mapToGeoJson({
    name: 'Map',
    layers: [{
      name: 'Layer',
      columns: [
        { id: 'col_owner', name: '负责人' },
        { id: 'col_fake_name', name: 'name' },
        { id: 'col_fake_color', name: 'color' },
      ],
      features: [{
        id: 4,
        name: 'Feature',
        description: 'Description',
        geometry: { type: 'Point', coordinates: [1, 2] },
        style: { color: '#123456' },
        properties: { col_owner: '张三', col_fake_name: 'Wrong', col_fake_color: 'Wrong' },
      }],
    }],
  });
  assert.deepEqual(exported.features[0].properties, {
    id: 4,
    name: 'Feature',
    description: 'Description',
    layer: 'Layer',
    color: '#123456',
    负责人: '张三',
  });
});
