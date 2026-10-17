import test from 'node:test';
import assert from 'node:assert/strict';
import { getMarkerIcon, MARKER_ICON_CATEGORIES, MARKER_ICONS, MARKER_ICON_IDS } from '../src/components/marker-icons.js';

test('all 100 marker options have distinct glyphs and belong to the ten reference categories', () => {
  assert.equal(MARKER_ICONS.length, 100);
  assert.equal(new Set(MARKER_ICONS.map((icon) => icon.id)).size, 100);
  assert.equal(new Set(MARKER_ICONS.map((icon) => JSON.stringify(icon.nodes))).size, 100);
  assert.deepEqual(MARKER_ICON_CATEGORIES.map((category) => MARKER_ICONS.filter((icon) => icon.categoryId === category.id).length), [11, 6, 12, 13, 7, 8, 15, 7, 5, 16]);
  const svgTags = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text']);
  for (const icon of MARKER_ICONS) {
    assert.ok(icon.labelZh && icon.labelEn && icon.nodes.length, icon.id);
    assert.ok(MARKER_ICON_IDS.has(icon.id));
    for (const [tag, attrs] of icon.nodes) {
      assert.ok(svgTags.has(tag), `${icon.id}: unsupported SVG node ${tag}`);
      assert.ok(Object.keys(attrs).every((name) => !name.includes('-')), `${icon.id}: SVG attributes must use React-compatible camelCase`);
      assert.ok(Object.values(attrs).every((value) => typeof value === 'string' || typeof value === 'number'));
    }
  }
});

test('existing marker IDs and legacy aliases still resolve after extending the catalog', () => {
  for (const id of ['pin', 'circle', 'star', 'flag', 'home', 'food', 'camera']) assert.equal(getMarkerIcon(id).id, id);
  assert.equal(getMarkerIcon('place').id, 'pin');
  assert.equal(getMarkerIcon('park').id, 'picnic');
  assert.equal(getMarkerIcon('unknown').id, 'pin');
  assert.equal(getMarkerIcon(undefined).id, 'pin');
});
