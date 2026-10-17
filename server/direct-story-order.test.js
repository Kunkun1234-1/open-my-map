import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveStoryRecord, orderStoryRecords } from '../src/components/shared-map-utils.js';

const hookSource = readFileSync(new URL('../src/components/useStoryOrder.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default function', 'function')
  .replace(/export function/g, 'function');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settleQueue() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function hookHarness() {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let mounted = true;
  let updatesAfterUnmount = 0;
  const sameDependencies = (left, right) => left && right && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useRef(initial) {
      const index = cursor++;
      slots[index] ||= { current: initial };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        if (!mounted) updatesAfterUnmount += 1;
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      }];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies)) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!sameDependencies(slots[index]?.dependencies, dependencies)) pendingEffects.push({ index, callback, dependencies });
    },
  };
  const hook = new Function('hooks', 'orderStoryRecords', 'moveStoryRecord', `
    const { useCallback, useEffect, useRef, useState } = hooks;
    ${hookSource}
    return useStoryOrder;
  `)(hooks, orderStoryRecords, moveStoryRecord);
  return {
    render(options) {
      mounted = true;
      cursor = 0;
      const value = hook(options);
      const effects = pendingEffects;
      pendingEffects = [];
      for (const effect of effects) {
        slots[effect.index]?.cleanup?.();
        slots[effect.index] = { dependencies: effect.dependencies, cleanup: effect.callback() };
      }
      return value;
    },
    unmount() {
      mounted = false;
      for (const slot of slots) slot?.cleanup?.();
    },
    updatesAfterUnmount() { return updatesAfterUnmount; },
  };
}

function mapData(overrides = {}) {
  return {
    id: 7,
    version: 12,
    story_order: [2, 1],
    layers: [
      { id: 1, visible: true, features: [{ id: 1 }, { id: 2 }] },
      { id: 2, visible: false, features: [{ id: 3 }, { id: 4 }] },
    ],
    ...overrides,
  };
}

function memorySessionStorage({ throws = false } = {}) {
  const values = new Map();
  return {
    getItem(key) {
      if (throws) throw new Error('storage unavailable');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (throws) throw new Error('storage unavailable');
      values.set(key, value);
    },
    seed(key, value) { values.set(key, value); },
  };
}

test('editor moves save the complete cross-layer order and lock re-entry while saving', async () => {
  const saving = deferred();
  const calls = [];
  const harness = hookHarness();
  const options = {
    mapData: mapData(),
    onSaveOrder: (...args) => { calls.push(args); return saving.promise; },
  };
  const firstMove = harness.render(options).move(4, 2);
  assert.deepEqual(harness.render(options).order, [4, 2, 1, 3], 'hidden-layer records stay in the submitted order');
  assert.equal(harness.render(options).saving, true);
  assert.equal(await harness.render(options).move(3, 1), false, 'a pending save locks another drag');
  assert.deepEqual(calls, [[[4, 2, 1, 3], 12]]);
  saving.resolve(mapData({ version: 13, story_order: [4, 2, 1, 3] }));
  assert.equal(await firstMove, true);
  assert.equal(harness.render(options).saving, false);
  assert.deepEqual(harness.render(options).order, [4, 2, 1, 3]);
});

test('public moves remain local, survive refresh and reconcile stale or duplicate ids', async () => {
  const originalStorage = globalThis.sessionStorage;
  const storage = memorySessionStorage();
  globalThis.sessionStorage = storage;
  try {
    storage.seed('open-my-map:story-order:7', JSON.stringify({ featureIds: [999, 2, 2] }));
    let requests = 0;
    const options = { mapData: mapData(), localOnly: true, onSaveOrder: () => { requests += 1; } };
    const firstPage = hookHarness();
    assert.deepEqual(firstPage.render(options).order, [2, 1, 3, 4]);
    assert.equal(await firstPage.render(options).move(4, 2), true);
    assert.equal(requests, 0);
    assert.deepEqual(firstPage.render(options).order, [4, 2, 1, 3]);
    const refreshedPage = hookHarness();
    assert.deepEqual(refreshedPage.render(options).order, [4, 2, 1, 3]);
  } finally {
    globalThis.sessionStorage = originalStorage;
  }

  globalThis.sessionStorage = memorySessionStorage({ throws: true });
  try {
    const page = hookHarness();
    const options = { mapData: mapData(), localOnly: true };
    assert.equal(await page.render(options).move(4, 2), true);
    assert.deepEqual(page.render(options).order, [4, 2, 1, 3], 'storage failure does not disable current-page dragging');
  } finally {
    globalThis.sessionStorage = originalStorage;
  }
});

test('ordinary save failures restore the current server order', async () => {
  const harness = hookHarness();
  const options = {
    mapData: mapData(),
    onSaveOrder: async () => { throw new Error('Network unavailable'); },
  };
  assert.equal(await harness.render(options).move(4, 2), false);
  const result = harness.render(options);
  assert.deepEqual(result.order, [2, 1, 3, 4]);
  assert.equal(result.saving, false);
  assert.equal(result.error, 'Network unavailable');
});

test('conflicts restore a newer map order received while the save is pending', async () => {
  const save = deferred();
  const harness = hookHarness();
  let options = { mapData: mapData(), onSaveOrder: () => save.promise };
  const move = harness.render(options).move(4, 2);
  await settleQueue();
  options = { ...options, mapData: mapData({ version: 13, story_order: [3, 2, 1, 4] }) };
  harness.render(options);
  save.reject(Object.assign(new Error('stale'), { status: 409, conflict: true }));
  assert.equal(await move, false);
  const result = harness.render(options);
  assert.deepEqual(result.order, [3, 2, 1, 4]);
  assert.match(result.error, /最新状态/);
});

test('a successful older save response cannot replace a newer collaborative map', async () => {
  const save = deferred();
  const harness = hookHarness();
  let options = { mapData: mapData(), onSaveOrder: () => save.promise };
  const move = harness.render(options).move(4, 2);
  await settleQueue();
  options = {
    ...options,
    mapData: mapData({
      version: 14,
      story_order: [3, 2, 1, 4, 5],
      layers: [
        { id: 1, visible: true, features: [{ id: 1 }, { id: 2 }, { id: 5 }] },
        { id: 2, visible: false, features: [{ id: 3 }, { id: 4 }] },
      ],
    }),
  };
  harness.render(options);
  save.resolve(mapData({ version: 13, story_order: [4, 2, 1, 3] }));
  assert.equal(await move, true);
  assert.deepEqual(harness.render(options).order, [3, 2, 1, 4, 5], 'new records and the newer collaborative order win');
});

test('a committed but unverifiable save keeps the optimistic order and requires refresh', async () => {
  let requests = 0;
  const harness = hookHarness();
  const options = {
    mapData: mapData(),
    onSaveOrder: async () => {
      requests += 1;
      throw Object.assign(new Error('checkpoint failed'), {
        operationSaved: true,
        savedData: mapData({ story_order: [1, 2, 3, 4] }),
      });
    },
  };
  assert.equal(await harness.render(options).move(4, 2), false);
  let result = harness.render(options);
  assert.deepEqual(result.order, [4, 2, 1, 3], 'savedData is not reapplied over the committed optimistic order');
  assert.equal(result.saving, false);
  assert.equal(result.needsRefresh, true);
  assert.match(result.error, /请刷新地图/);
  assert.equal(await result.move(3, 1), false);
  result = harness.render(options);
  assert.equal(requests, 1, 'refresh lock prevents a misleading retry');
  assert.deepEqual(result.order, [4, 2, 1, 3]);
});

test('an unverifiable committed save uses a newer collaborative order when one arrived', async () => {
  const save = deferred();
  const harness = hookHarness();
  let options = { mapData: mapData(), onSaveOrder: () => save.promise };
  const move = harness.render(options).move(4, 2);
  await settleQueue();
  options = { ...options, mapData: mapData({ version: 13, story_order: [3, 2, 1, 4] }) };
  harness.render(options);
  save.reject(Object.assign(new Error('checkpoint failed'), {
    operationSaved: true,
    savedData: mapData({ version: 13, story_order: [1, 2, 3, 4] }),
  }));
  assert.equal(await move, false);
  const result = harness.render(options);
  assert.deepEqual(result.order, [3, 2, 1, 4]);
  assert.equal(result.needsRefresh, true);
});

test('a pending save cannot update state after unmount', async () => {
  const save = deferred();
  const harness = hookHarness();
  const options = { mapData: mapData(), onSaveOrder: () => save.promise };
  const move = harness.render(options).move(4, 2);
  await settleQueue();
  harness.unmount();
  save.resolve(mapData({ version: 13, story_order: [4, 2, 1, 3] }));
  assert.equal(await move, false);
  assert.equal(harness.updatesAfterUnmount(), 0);
});
