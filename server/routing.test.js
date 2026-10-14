import assert from 'node:assert/strict';
import test from 'node:test';
import { toDisplayLngLat, toStorageLngLat } from '../src/amap.js';
import {
  combineRouteLegs, normalizeAMapRoutes, parseRouteCoordinate, routeAMapAlternatives,
  routeDataForSave, validRoutePosition,
} from '../src/routing.js';

const origin = [116.39, 39.90];
const waypoint = [116.40, 39.91];
const destination = [116.41, 39.92];
const sdkPoint = (point) => ({ lng: point[0], lat: point[1] });
const sdkRoute = (points, distance = 1500, duration = 300, key = 'steps') => ({
  distance, time: duration,
  [key]: [{ instruction: '沿道路前行', road: '测试路', distance, time: duration, path: points.map((point) => sdkPoint(toDisplayLngLat(...point))) }],
});

test('coordinates reject empty values, invalid numbers, and geographic bounds', () => {
  assert.equal(validRoutePosition([null, null]), false);
  assert.equal(validRoutePosition(['', '']), false);
  assert.equal(validRoutePosition([Infinity, 20]), false);
  assert.equal(validRoutePosition([180.01, 30]), false);
  assert.equal(validRoutePosition([120, -90.01]), false);
  assert.deepEqual(parseRouteCoordinate('116.39， 39.90'), origin);
  assert.equal(parseRouteCoordinate('北京站'), null);
  assert.throws(() => parseRouteCoordinate('190, 30'), /坐标超出范围/);
});

test('driving sends GCJ02 waypoints in one official request and returns every actual alternative', async () => {
  const calls = [];
  const AMap = { Driving: class {
    search(start, end, options, callback) {
      calls.push({ start, end, options });
      callback('complete', { routes: [sdkRoute([origin, waypoint, destination]), sdkRoute([origin, [116.405, 39.915], destination], 1700, 350)] });
    }
    clear() {}
  } };
  const routes = await routeAMapAlternatives([origin, waypoint, destination], 'driving', { load: async () => AMap });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { start: toDisplayLngLat(...origin), end: toDisplayLngLat(...destination), options: { waypoints: [toDisplayLngLat(...waypoint)] } });
  assert.equal(routes.length, 2);
  assert.equal(routes[1].distance, 1700);
  assert.equal(routes[1].duration, 350);
  assert.equal(routes[0].steps[0].instruction, '沿道路前行');
  assert.equal(routes[0].segmentPaths.length, 2);
  const restored = routes[0].geometry.coordinates[0];
  assert.ok(Math.abs(restored[0] - origin[0]) < 1e-8);
  assert.ok(Math.abs(restored[1] - origin[1]) < 1e-8);
});

test('a single service alternative stays a single route', async () => {
  const AMap = { Driving: class {
    search(start, end, callback) { callback('complete', { routes: [sdkRoute([origin, destination])] }); }
    clear() {}
  } };
  const routes = await routeAMapAlternatives([origin, destination], 'driving', { load: async () => AMap });
  assert.equal(routes.length, 1);
});

test('cycling reads the official rides step field rather than requiring walking steps', async () => {
  const calls = [];
  const AMap = { Riding: class {
    search(start, end, callback) {
      calls.push([start, end]);
      callback('complete', { routes: [{ distance: 850, time: 240, rides: [{ instruction: '骑行前往终点', distance: 850, time: 240, path: [sdkPoint(start), sdkPoint(end)] }] }] });
    }
    clear() {}
  } };
  const routes = await routeAMapAlternatives([origin, waypoint, destination], 'cycling', { load: async () => AMap });
  assert.equal(calls.length, 2);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].distance, 1700);
  assert.equal(routes[0].duration, 480);
  assert.equal(routes[0].steps.length, 2);
  assert.equal(routes[0].steps[1].segmentIndex, 1);
  assert.equal(routes[0].segmentPaths.length, 2);
});

test('walking preserves returned curved road paths across every waypoint leg', async () => {
  const calls = [];
  const AMap = { Walking: class {
    search(start, end, callback) {
      calls.push([start, end]);
      const bend = [(start[0] + end[0]) / 2 + 0.001, (start[1] + end[1]) / 2];
      callback('complete', { routes: [{ distance: 600, time: 450, steps: [{ instruction: '步行', distance: 600, time: 450, path: [sdkPoint(start), sdkPoint(bend), sdkPoint(end)] }] }] });
    }
    clear() {}
  } };
  const routes = await routeAMapAlternatives([origin, waypoint, destination], 'walking', { load: async () => AMap });
  assert.equal(calls.length, 2);
  assert.equal(routes[0].geometry.coordinates.length, 5);
  assert.deepEqual(routes[0].geometry.coordinates[2], toStorageLngLat(...toDisplayLngLat(...waypoint)));
  assert.equal(routes[0].distance, 1200);
  assert.equal(routes[0].duration, 900);
});

test('no-data or missing road geometry rejects without manufacturing a straight route', async () => {
  for (const response of [['no_data', {}], ['complete', { routes: [{ distance: 1000, time: 100, steps: [] }] }]]) {
    const AMap = { Driving: class {
      search(start, end, callback) { callback(...response); }
      clear() {}
    } };
    await assert.rejects(routeAMapAlternatives([origin, destination], 'driving', { load: async () => AMap }), /暂未找到可用路线/);
  }
});

test('failed waypoint leg rejects the whole walking plan', async () => {
  let calls = 0;
  const AMap = { Walking: class {
    search(start, end, callback) {
      calls += 1;
      if (calls === 2) callback('no_data', {});
      else callback('complete', { routes: [sdkRoute([origin, waypoint])] });
    }
    clear() {}
  } };
  await assert.rejects(routeAMapAlternatives([origin, waypoint, destination], 'walking', { load: async () => AMap }), /暂未找到可用路线/);
});

test('aborting a stale request rejects immediately and ignores its later callback', async () => {
  let callback;
  let clears = 0;
  const controller = new AbortController();
  const AMap = { Driving: class {
    search(start, end, onResult) { callback = onResult; }
    clear() { clears += 1; }
  } };
  const promise = routeAMapAlternatives([origin, destination], 'driving', { load: async () => AMap, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  callback('complete', { routes: [sdkRoute([origin, destination])] });
  assert.equal(clears, 1);
});

test('service timeout is a visible error and releases the service', async () => {
  let cleared = false;
  const AMap = { Driving: class {
    search() {}
    clear() { cleared = true; }
  } };
  await assert.rejects(routeAMapAlternatives([origin, destination], 'driving', { load: async () => AMap, timeoutMs: 5 }), /路线规划超时/);
  assert.equal(cleared, true);
});

test('bad stop counts and coordinates fail before loading the SDK', async () => {
  const load = async () => { throw new Error('should not load'); };
  await assert.rejects(routeAMapAlternatives([origin], 'driving', { load }), /有效起点/);
  await assert.rejects(routeAMapAlternatives(Array(11).fill(origin), 'driving', { load }), /九个目的地/);
  await assert.rejects(routeAMapAlternatives([origin, [999, 0]], 'walking', { load }), /有效起点/);
});

test('save metadata keeps serializable WGS84 stops, travel mode, selected index, and real directions', () => {
  const route = normalizeAMapRoutes({ routes: [sdkRoute([origin, destination])] }, 'driving', [origin, destination])[0];
  const metadata = routeDataForSave(route, [{ text: '起点', position: origin }, { text: '终点', position: destination }], 2);
  const stored = JSON.parse(JSON.stringify(metadata));
  assert.equal(stored.mode, 'driving');
  assert.equal(stored.selectedAlternativeIndex, 2);
  assert.deepEqual(stored.stops[0].position, origin);
  assert.equal(stored.distance, 1500);
  assert.equal(stored.duration, 300);
  assert.equal(stored.steps[0].instruction, '沿道路前行');
  assert.equal(stored.segmentPaths.length, 1);
});

test('leg alternatives are real combinations and duplicate paths are omitted', () => {
  const first = normalizeAMapRoutes({ routes: [sdkRoute([origin, waypoint])] }, 'walking', [origin, waypoint])[0];
  const second = normalizeAMapRoutes({ routes: [sdkRoute([waypoint, destination])] }, 'walking', [waypoint, destination])[0];
  const routes = combineRouteLegs([[first, first], [second]], 'walking');
  assert.equal(routes.length, 1);
  assert.equal(routes[0].distance, 3000);
  assert.equal(routes[0].duration, 600);
});
