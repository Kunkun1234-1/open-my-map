import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/AmapMap.jsx', import.meta.url), 'utf8');
const controllerSource = source.slice(source.indexOf('function buildController('), source.indexOf('function createBaseLayerSet('));

function harness(reducedMotion = false) {
  const calls = [];
  const map = {
    getContainer: () => ({}),
    setCenter: (...args) => calls.push(['center', ...args]),
    setFitView: (...args) => calls.push(['fit', ...args]),
  };
  const point = { getPosition: () => [121, 31] };
  const line = {};
  const polygon = {};
  const registry = { current: new Map([[1, { type: 'Point', overlay: point }], [2, { type: 'LineString', overlay: line }], [3, { type: 'Polygon', overlay: polygon }]]) };
  const build = new Function('window', 'viewportPadding', 'displayPosition', `${controllerSource}; return buildController;`)(
    { matchMedia: () => ({ matches: reducedMotion }) }, () => [40, 40, 40, 40], (coordinates) => coordinates,
  );
  return { controller: build({}, map, registry, () => {}), calls, line, polygon };
}

test('preview jumps center points and fit routes or areas immediately without camera animation', () => {
  const { controller, calls, line, polygon } = harness();
  controller.focusFeature(1, { immediate: true });
  controller.focusFeature(2, { immediate: true });
  controller.focusFeature(3, { immediate: true });
  assert.deepEqual(calls, [
    ['center', [121, 31], true, 0],
    ['fit', [line], true, [40, 40, 40, 40], 18],
    ['fit', [polygon], true, [40, 40, 40, 40], 18],
  ]);
});

test('instant story jumps do not change ordinary camera motion or reduced-motion preferences', () => {
  const { controller, calls } = harness();
  controller.focusFeature(1, { immediate: true });
  controller.focusFeature(1);
  controller.panTo([122, 32]);
  assert.deepEqual(calls.slice(1), [
    ['center', [121, 31], false, 1000],
    ['center', [122, 32], false, 1000],
  ]);
  const reduced = harness(true);
  reduced.controller.focusFeature(1);
  reduced.controller.focusFeature(2);
  assert.equal(reduced.calls[0][2], true);
  assert.equal(reduced.calls[0][3], 0);
  assert.equal(reduced.calls[1][2], true);
});
