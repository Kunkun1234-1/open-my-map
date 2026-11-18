import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/AmapMap.jsx', import.meta.url), 'utf8');
const controllerSource = source.slice(source.indexOf('function buildController('), source.indexOf('function createBaseLayerSet('));
const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const latitude = (y) => Number(((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI).toFixed(12));

function harness({ reducedMotion = false, zoom = 14 } = {}) {
  const calls = [];
  const frames = new Map();
  let frameId = 0;
  let current = [120, 30];
  let now = 0;
  const map = {
    getContainer: () => ({ getBoundingClientRect: () => ({ width: 800, height: 600 }) }),
    lngLatToContainer: ([lng, lat]) => ({ x: 400 + (lng - current[0]) * 100,
      y: 300 - (mercator(lat) - mercator(current[1])) * 18000 / Math.PI }),
    containerToLngLat: ({ x, y }) => [current[0] + (x - 400) / 100,
      latitude(mercator(current[1]) - (y - 300) * Math.PI / 18000)],
    getZoom: () => zoom,
    getFitZoomAndCenterByBounds: (bounds) => [bounds.zoom, bounds.center],
    setZoomAndCenter: (...args) => calls.push(['zoom-center', ...args]),
    setCenter(center, immediately, duration) {
      calls.push(['center', [...center], immediately, duration]);
      current = [...center];
    },
    setFitView: (...args) => calls.push(['fit', ...args]),
  };
  const point = { getPosition: () => [126, 34] };
  const line = { getBounds: () => ({ getCenter: () => [114, 33] }) };
  const polygon = { getBounds: () => ({ getCenter: () => [126, 26] }) };
  const registry = { current: new Map([
    [1, { type: 'Point', overlay: point }],
    [2, { type: 'LineString', overlay: line }],
    [3, { type: 'Polygon', overlay: polygon }],
  ]) };
  const build = new Function('window', 'viewportPadding', 'displayPosition', 'AMAP_MIN_ZOOM', 'AMAP_MAX_ZOOM', `${controllerSource}; return buildController;`)(
    {
      matchMedia: () => ({ matches: reducedMotion }),
      requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: (id) => frames.delete(id),
    }, () => [40, 40, 40, 40], (coordinates) => coordinates, 2, 19,
  );
  const AMap = { Pixel: class { constructor(x, y) { this.x = x; this.y = y; } } };
  const controller = build(AMap, map, registry, () => {});
  function frame(at) {
    now = at;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(at));
  }
  function finish() {
    for (let count = 0; frames.size && count < 200; count += 1) frame(now + 50);
    assert.equal(frames.size, 0, 'animation terminates');
  }
  return { controller, calls, line, polygon, registry, frames,
    frame, finish, center: () => current, pixel: (position) => map.lngLatToContainer(position),
    fromPixel: (x, y) => map.containerToLngLat({ x, y }) };
}
function close(actual, expected, epsilon = 1e-8) {
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < epsilon,
    `${actual} differs from ${expected}`));
}

test('explicit jumps and ordinary editor moves retain their existing behavior', () => {
  const h = harness();
  h.controller.focusFeature(1, { immediate: true });
  h.controller.focusFeature(2, { immediate: true });
  h.controller.focusFeature(3, { immediate: true });
  assert.deepEqual(h.calls, [
    ['center', [126, 34], true, 0],
    ['fit', [h.line], true, [40, 40, 40, 40], 18],
    ['fit', [h.polygon], true, [40, 40, 40, 40], 18],
  ]);
  h.controller.focusFeature(1);
  h.controller.panTo([122, 32]);
  assert.deepEqual(h.calls.slice(-2), [
    ['center', [126, 34], false, 1000], ['center', [122, 32], false, 1000],
  ]);
});

test('short and long moves pan through the midpoint, with slow ends and a fast middle', () => {
  for (const [x, y] of [[700, 200], [3000, 1600], [-1800, -900]]) {
    const h = harness();
    const target = h.fromPixel(x, y);
    const distance = Math.hypot(x - 400, y - 300);
    h.registry.current.set(5, { type: 'Point', overlay: { getPosition: () => target } });
    h.controller.focusFeature(5, { drift: true });
    const progress = [];
    for (let at = 0; h.frames.size && at <= 2400; at += 20) {
      h.frame(at);
      const point = h.pixel(target);
      progress.push(1 - Math.hypot(point.x - 400, point.y - 300) / distance);
    }
    const last = progress.length - 1;
    assert.ok(progress.every((value, i) => !i || value >= progress[i - 1]));
    assert.ok(progress[1] < .01 && 1 - progress[last - 1] < .01);
    assert.ok(progress.some((value) => value > .47 && value < .53), 'passes through the middle');
    const middleStep = Math.floor(last / 2);
    assert.ok(progress[middleStep] - progress[middleStep - 1] > 10 * progress[1]);
    assert.ok(progress.every((value, i) => !i || value - progress[i - 1] < .05), 'no jump between frames');
    assert.deepEqual(h.center(), target);
    assert.equal(h.frames.size, 0);
    assert.equal(h.controller.isFocusMoving(), false);
  }
});

test('search destinations settle immediately while ordinary view changes retain animation', () => {
  const h = harness();
  h.controller.setView([121.455, 31.249], 16, { immediate: true });
  assert.deepEqual(h.calls.at(-1), ['zoom-center', 16, [121.455, 31.249], true, 0]);
  h.controller.setView([114.06, 22.55], 13);
  assert.deepEqual(h.calls.at(-1), ['zoom-center', 13, [114.06, 22.55], false, 1000]);
  assert.equal(h.frames.size, 0);
});

test('rapid reverse selection starts from the current view and cancels the previous destination', () => {
  const h = harness();
  h.controller.focusFeature(1, { drift: true });
  h.frame(0);
  h.frame(600);
  const interrupted = [...h.center()];
  h.controller.focusFeature(2, { drift: true });
  assert.equal(h.frames.size, 1);
  h.frame(650);
  close(h.center(), interrupted);
  h.finish();
  assert.deepEqual(h.center(), [114, 33]);
});

test('canceling at any phase leaves no late frames or position reset', () => {
  for (const time of [100, 600, 1200]) {
    const h = harness();
    h.controller.focusFeature(1, { drift: true });
    h.frame(0);
    h.frame(time);
    const center = [...h.center()];
    h.controller.cancelFocusMotion();
    h.frame(4000);
    assert.deepEqual(h.center(), center);
    assert.equal(h.frames.size, 0);
    assert.equal(h.controller.isFocusMoving(), false);
  }
});

test('manual pan interrupts a scene and reduced motion bypasses all scene effects', () => {
  const h = harness();
  h.controller.focusFeature(1, { drift: true });
  h.frame(0);
  h.controller.panTo([123, 33]);
  h.frame(3000);
  assert.deepEqual(h.calls.at(-1), ['center', [123, 33], false, 1000]);
  const reduced = harness({ reducedMotion: true });
  reduced.controller.focusFeature(1, { drift: true });
  assert.deepEqual(reduced.calls, [['center', [126, 34], true, 0]]);
  assert.equal(reduced.frames.size, 0);
});

test('a centered point does not animate', () => {
  const h = harness();
  h.registry.current.set(5, { type: 'Point', overlay: { getPosition: () => [120, 30] } });
  h.controller.focusFeature(5, { drift: true });
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.calls, [['center', [120, 30], true, 0]]);
});

test('points, lines and areas preserve manually chosen zoom levels in both directions', () => {
  for (const zoom of [7, 13, 17]) {
    const h = harness({ zoom });
    for (const id of [1, 2, 3, 2, 1]) {
      h.controller.focusFeature(id, { drift: true });
      h.finish();
      assert.equal(h.controller.getZoom(), zoom);
    }
    assert.ok(h.calls.every((call) => call[0] === 'center'));
  }
});

test('a throttled tab settles on the target without leaving pending work', () => {
  const h = harness();
  h.controller.focusFeature(1, { drift: true });
  h.frame(0);
  h.frame(10000);
  assert.deepEqual(h.center(), [126, 34]);
  assert.equal(h.controller.isFocusMoving(), false);
  assert.equal(h.frames.size, 0);
});
