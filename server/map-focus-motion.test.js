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
  const phases = [];
  const blends = [];
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
    [4, { type: 'Point', overlay: { getPosition: () => [120.5, 30.5] } }],
  ]) };
  const build = new Function('window', 'viewportPadding', 'displayPosition', 'AMAP_MIN_ZOOM', 'AMAP_MAX_ZOOM', `${controllerSource}; return buildController;`)(
    {
      matchMedia: () => ({ matches: reducedMotion }),
      requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: (id) => frames.delete(id),
    }, () => [40, 40, 40, 40], (coordinates) => coordinates, 2, 19,
  );
  const AMap = { Pixel: class { constructor(x, y) { this.x = x; this.y = y; } } };
  const controller = build(AMap, map, registry, () => {}, {
    onScenePhase: (phase) => phases.push(phase),
    captureScene() {
      const blend = { updates: [], removed: false,
        update(...args) { this.updates.push(args); }, remove() { this.removed = true; } };
      blends.push(blend);
      return blend;
    },
  });
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
  return { controller, calls, line, polygon, registry, frames, phases, blends,
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

test('nearby targets use a continuous 800ms pan without a cut or overlay', () => {
  const h = harness();
  h.controller.focusFeature(4, { drift: true });
  h.frame(0);
  const start = [...h.center()];
  h.frame(400);
  const midpoint = [...h.center()];
  h.frame(800);
  assert.ok(midpoint[0] > start[0] && midpoint[0] < 120.5);
  assert.deepEqual(h.center(), [120.5, 30.5]);
  assert.equal(h.blends.length, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.controller.isFocusMoving(), false);
  assert.ok(h.calls.every((call) => call[0] === 'center'));
});

test('far transitions accelerate out, cut once, crossfade for 200ms, and decelerate in', () => {
  const h = harness();
  h.controller.focusFeature(1, { drift: true });
  h.frame(0);
  h.frame(300);
  const a = [...h.center()];
  h.frame(600);
  const b = [...h.center()];
  h.frame(900);
  const c = [...h.center()];
  assert.ok(c[0] - b[0] > b[0] - a[0], 'outgoing motion accelerates');
  h.frame(1200);
  assert.equal(h.blends.length, 1);
  assert.equal(h.blends[0].updates[0][0], 0);
  assert.ok(h.center()[0] < 126 && h.center()[0] > 125);
  h.frame(1300);
  assert.equal(h.blends[0].updates.at(-1)[0], .5);
  h.frame(1400);
  assert.equal(h.blends[0].removed, true);
  h.frame(1500);
  const d = [...h.center()];
  h.frame(1800);
  const e = [...h.center()];
  h.frame(2100);
  const f = [...h.center()];
  assert.ok(f[0] - e[0] < e[0] - d[0], 'incoming motion decelerates');
  h.frame(2400);
  assert.deepEqual(h.center(), [126, 34]);
  assert.equal(h.blends.length, 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.phases.at(-1), null);
});

test('outgoing and incoming velocity match in screen space in every direction', () => {
  for (const [x, y] of [[0, 0], [800, 0], [0, 600], [800, 600], [400, 0], [800, 300]]) {
    const h = harness();
    const target = h.fromPixel(x, y);
    h.registry.current.set(5, { type: 'Point', overlay: { getPosition: () => target } });
    h.controller.focusFeature(5, { drift: true });
    h.frame(0);
    h.frame(1180);
    const before = h.pixel(target);
    h.frame(1190);
    const departure = h.pixel(target);
    h.frame(1200);
    const cut = h.pixel(target);
    h.frame(1210);
    const arrival = h.pixel(target);
    const outgoing = [before.x - departure.x, before.y - departure.y];
    const incoming = [cut.x - arrival.x, cut.y - arrival.y];
    close(outgoing, incoming, .01);
    assert.ok(outgoing[0] * (x - 400) + outgoing[1] * (y - 300) > 0);
    h.finish();
    close(h.center(), target);
  }
});

test('rapid forward and reverse selection starts from the current view and removes the old blend', () => {
  const h = harness();
  h.controller.focusFeature(1, { drift: true });
  h.frame(0);
  h.frame(1200);
  h.frame(1250);
  const interrupted = [...h.center()];
  h.controller.focusFeature(2, { drift: true });
  assert.equal(h.blends[0].removed, true);
  assert.equal(h.frames.size, 1);
  h.frame(1300);
  close(h.center(), interrupted);
  h.finish();
  assert.deepEqual(h.center(), [114, 33]);
  assert.equal(h.blends.length, 2);
});

test('canceling outgoing or incoming motion leaves no late frames, blend, or position reset', () => {
  for (const time of [600, 1200, 1300, 1700]) {
    const h = harness();
    h.controller.focusFeature(1, { drift: true });
    h.frame(0);
    h.frame(time);
    const center = [...h.center()];
    h.controller.cancelFocusMotion();
    h.frame(4000);
    assert.deepEqual(h.center(), center);
    assert.equal(h.frames.size, 0);
    assert.ok(h.blends.every((blend) => blend.removed));
    assert.equal(h.controller.isFocusMoving(), false);
    assert.equal(h.phases.at(-1), null);
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
  assert.equal(reduced.blends.length, 0);
});

test('a centered point does not animate or create a directionless flash', () => {
  const h = harness();
  h.registry.current.set(5, { type: 'Point', overlay: { getPosition: () => [120, 30] } });
  h.controller.focusFeature(5, { drift: true });
  assert.equal(h.frames.size, 0);
  assert.equal(h.blends.length, 0);
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

test('a throttled tab resumes with a complete arrival rather than skipping to the endpoint', () => {
  const h = harness();
  h.controller.focusFeature(1, { drift: true });
  h.frame(0);
  h.frame(10000);
  assert.equal(h.controller.isFocusMoving(), true);
  assert.equal(h.blends[0].updates[0][0], 0);
  assert.notDeepEqual(h.center(), [126, 34]);
  h.frame(11200);
  assert.deepEqual(h.center(), [126, 34]);
  assert.equal(h.frames.size, 0);
});
