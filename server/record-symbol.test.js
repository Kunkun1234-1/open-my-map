import test from 'node:test';
import assert from 'node:assert/strict';
import { recordGeometryPath, recordSymbolStyle } from '../src/components/record-symbol-utils.js';

test('record glyph uses feature overrides and inherits valid layer style', () => {
  const layer = { style: { icon: 'star', color: '#008800', fillOpacity: .4 } };
  assert.deepEqual(recordSymbolStyle({ style: { icon: 'flag', color: '#aa0000' } }, layer), {
    icon: 'flag', color: '#aa0000', fillColor: '#aa0000', fillOpacity: .4,
  });
  assert.equal(recordSymbolStyle({ style: { icon: 'unknown' } }, layer).icon, 'star');
  assert.equal(recordSymbolStyle({ style: { icon: 'park' } }, layer).icon, 'picnic');
  assert.deepEqual(recordSymbolStyle({}, {}), { icon: 'pin', color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: .28 });
});

test('route thumbnail retains bends, north-up direction and horizontal/vertical lines', () => {
  assert.equal(recordGeometryPath({ type: 'LineString', coordinates: [[0, 0], [1, 0]] }), 'M3.00,12.00 L21.00,12.00');
  assert.equal(recordGeometryPath({ type: 'LineString', coordinates: [[0, 0], [0, 1]] }), 'M12.00,21.00 L12.00,3.00');
  const bent = recordGeometryPath({ type: 'LineString', coordinates: [[0, 0], [0, 1], [1, 1]] });
  assert.equal((bent.match(/L/g) || []).length, 2);
  assert.notEqual(bent, recordGeometryPath({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }));
});

test('area thumbnail closes each actual ring including holes', () => {
  const path = recordGeometryPath({ type: 'Polygon', coordinates: [
    [[0, 0], [1, 0], [1, 1], [0, 0]],
    [[.2, .2], [.3, .2], [.3, .3], [.2, .2]],
  ] });
  assert.equal((path.match(/M/g) || []).length, 2);
  assert.equal((path.match(/Z/g) || []).length, 2);
  assert.ok(!path.includes('NaN'));
});

test('date-line routes use the short crossing and invalid geometry falls back safely', () => {
  assert.equal(recordGeometryPath({ type: 'LineString', coordinates: [[179, 0], [-179, 0]] }), 'M3.00,12.00 L21.00,12.00');
  for (const geometry of [null, { type: 'Point', coordinates: [1, 2] },
    { type: 'LineString', coordinates: [[1, 2], [1, 2]] },
    { type: 'LineString', coordinates: [[1, 2], [null, 3]] },
    { type: 'Polygon', coordinates: [] }]) assert.equal(recordGeometryPath(geometry), '');
});
