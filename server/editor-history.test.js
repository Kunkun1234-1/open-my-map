import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Execute the production hook with a deterministic hook lifecycle and API
// promises. No browser or timers are needed to exercise request ordering.
const hookSource = readFileSync(new URL('../src/components/editor/useEditorHistory.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default function', 'function');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settleQueue() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function hookHarness(api) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
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
  const hook = new Function('hooks', 'api', `
    const { useCallback, useEffect, useRef, useState } = hooks;
    ${hookSource}
    return useEditorHistory;
  `)(hooks, api);
  return {
    render(options) {
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
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function mapData(id, fingerprint = `content-${id}`) {
  return { id, layers: [], contentFingerprint: fingerprint };
}

function successfulApi() {
  const callsByMap = new Map();
  return {
    createCheckpoint: async (id) => {
      const count = (callsByMap.get(id) || 0) + 1;
      callsByMap.set(id, count);
      return { token: `map-${id}-${count}`, fingerprint: count % 2 ? `before-${id}` : `after-${id}` };
    },
    restoreCheckpoint: async (id) => ({ map: mapData(id) }),
  };
}

test('switching maps cancels queued edits before mutation and gives the new map its own queue', async () => {
  const before = deferred();
  const calls = [];
  const applied = [];
  let mutations = 0;
  let newMapCalls = 0;
  const harness = hookHarness({ createCheckpoint: (id) => {
    calls.push(id);
    return id === 1 ? before.promise : Promise.resolve({ token: `new-${++newMapCalls}`, fingerprint: newMapCalls === 1 ? 'before' : 'after' });
  } });
  let options = { mapId: 1, canEdit: true, onApply: (map) => applied.push(map.id) };
  const oldMap = harness.render(options);
  const mutate = async () => { mutations += 1; return mapData(1); };
  const first = oldMap.run('first', mutate).catch((error) => error);
  const queued = oldMap.run('queued', mutate).catch((error) => error);
  await settleQueue();
  options = { ...options, mapId: 2 };
  await harness.render(options).run('new map', async () => mapData(2));
  assert.deepEqual(calls, [1, 2, 2], 'the new map must not wait for the old API');
  before.resolve({ token: 'old', fingerprint: 'before' });
  assert.equal((await first).name, 'AbortError');
  assert.equal((await queued).name, 'AbortError');
  assert.equal(mutations, 0);
  assert.deepEqual(applied, [2]);
  assert.equal(harness.render(options).canUndo, true);
  oldMap.clear();
  assert.equal(harness.render(options).canUndo, true, 'a departed map callback must not clear new history');
  harness.unmount();
});

test('an in-flight mutation cannot apply its result after switching maps or unmounting', async () => {
  for (const action of ['switch', 'unmount']) {
    const mutation = deferred();
    const applied = [];
    const harness = hookHarness(successfulApi());
    const options = { mapId: 1, canEdit: true, onApply: (map) => applied.push(map.id) };
    const operation = harness.render(options).run('edit', () => mutation.promise).catch((error) => error);
    await settleQueue();
    if (action === 'switch') harness.render({ ...options, mapId: 2 });
    else harness.unmount();
    mutation.resolve(mapData(1));
    assert.equal((await operation).name, 'AbortError');
    assert.deepEqual(applied, []);
    harness.unmount();
  }
});

test('an old checkpoint failure cannot erase another map’s undo entries', async () => {
  const after = deferred();
  let oldCalls = 0;
  const api = successfulApi();
  const successfulCheckpoint = api.createCheckpoint;
  api.createCheckpoint = (id) => id !== 1 ? successfulCheckpoint(id)
    : ++oldCalls === 1 ? Promise.resolve({ token: 'before', fingerprint: 'before' }) : after.promise;
  const harness = hookHarness(api);
  let options = { mapId: 1, canEdit: true };
  const oldOperation = harness.render(options).run('old', async () => mapData(1)).catch((error) => error);
  await settleQueue();
  options = { ...options, mapId: 2 };
  await harness.render(options).run('new', async () => mapData(2));
  after.reject(Object.assign(new Error('Old conflict'), { status: 409 }));
  assert.equal((await oldOperation).name, 'AbortError');
  assert.equal(harness.render(options).canUndo, true);
  harness.unmount();
});

test('an in-flight undo cannot apply or move history stacks after switching maps', async () => {
  const restore = deferred();
  const applied = [];
  const api = successfulApi();
  api.restoreCheckpoint = () => restore.promise;
  const harness = hookHarness(api);
  let options = { mapId: 1, canEdit: true, onApply: (map) => applied.push(map.id) };
  await harness.render(options).run('old', async () => mapData(1));
  const undo = harness.render(options).undo();
  await settleQueue();
  options = { ...options, mapId: 2 };
  await harness.render(options).run('new', async () => mapData(2));
  restore.resolve({ map: mapData(1) });
  assert.equal(await undo, false);
  assert.deepEqual(applied, [1, 2]);
  assert.equal(harness.render(options).canUndo, true);
  assert.equal(harness.render(options).canRedo, false);
  harness.unmount();
});

test('a collaboration update invalidates pending edit results before they apply', async () => {
  const mutation = deferred();
  const applied = [];
  const harness = hookHarness(successfulApi());
  const options = { mapId: 1, canEdit: true, onApply: (map) => applied.push(map.id) };
  const history = harness.render(options);
  const operation = history.run('edit', () => mutation.promise).catch((error) => error);
  await settleQueue();
  history.clear();
  mutation.resolve(mapData(1));
  assert.equal((await operation).name, 'AbortError');
  assert.deepEqual(applied, []);
  assert.equal(harness.render(options).canUndo, false);
  harness.unmount();
});

test('transient undo failures preserve the entry for retry, while conflicts discard it', async () => {
  const api = successfulApi();
  let attempts = 0;
  api.restoreCheckpoint = async () => {
    if (attempts++ === 0) throw new TypeError('Network failure');
    return { map: mapData(1) };
  };
  const harness = hookHarness(api);
  const options = { mapId: 1, canEdit: true };
  await harness.render(options).run('edit', async () => mapData(1));
  assert.equal(await harness.render(options).undo(), false);
  assert.equal(harness.render(options).canUndo, true);
  assert.equal(await harness.render(options).undo(), true);
  assert.equal(harness.render(options).canRedo, true);
  api.restoreCheckpoint = async () => { throw Object.assign(new Error('Content changed'), { status: 409, conflict: true }); };
  assert.equal(await harness.render(options).redo(), false);
  assert.equal(harness.render(options).canUndo, false);
  assert.equal(harness.render(options).canRedo, false);
  harness.unmount();
});

test('failed post-edit validation never returns old data for callers to reapply', async () => {
  for (const failure of [new TypeError('Network failure'), Object.assign(new Error('Content changed'), { status: 409, conflict: true })]) {
    const after = deferred();
    let count = 0;
    let visibleMap;
    const api = { createCheckpoint: () => ++count === 1
      ? Promise.resolve({ token: 'before', fingerprint: 'before' }) : after.promise };
    const harness = hookHarness(api);
    const options = { mapId: 1, canEdit: true, onApply: (map) => { visibleMap = map; } };
    const oldMap = mapData(1, 'old');
    const operation = harness.render(options).run('saved edit', async () => oldMap)
      .then((map) => { visibleMap = map; return null; }, (error) => error);
    await settleQueue();
    const newerMap = mapData(1, 'newer collaboration');
    visibleMap = newerMap;
    after.reject(failure);
    const error = await operation;
    assert.equal(error.operationSaved, true);
    assert.equal(error.savedData, oldMap, 'the committed ID remains available separately');
    assert.equal(visibleMap, newerMap, 'a caller must not receive the stale response as success');
    assert.equal(harness.render(options).canUndo, false);
    harness.unmount();
  }
});

test('viewer edits are rejected before any checkpoint or mutation request', async () => {
  let requests = 0;
  const harness = hookHarness({ createCheckpoint: async () => { requests += 1; } });
  const options = { mapId: 1, canEdit: false };
  await assert.rejects(harness.render(options).run('viewer', async () => { requests += 1; return mapData(1); }), /只读/);
  assert.equal(requests, 0);
  assert.equal(await harness.render(options).undo(), false);
  harness.unmount();
});

test('a successful unrecorded media edit preserves queued user edits and starts fresh undo history', async () => {
  const mediaReady = deferred();
  const snapshots = new Map();
  let serverMap = { ...mapData(1, 'initial'), name: 'Initial name', media: [] };
  let tokens = 0;
  const harness = hookHarness({
    createCheckpoint: async (_mapId, settings = {}) => {
      if (settings.expectedFingerprint) assert.equal(settings.expectedFingerprint, serverMap.contentFingerprint);
      const token = `snapshot-${++tokens}`;
      snapshots.set(token, structuredClone(serverMap));
      return { token, fingerprint: serverMap.contentFingerprint };
    },
    restoreCheckpoint: async (_mapId, settings) => {
      assert.equal(settings.expectedFingerprint, serverMap.contentFingerprint);
      serverMap = structuredClone(snapshots.get(settings.token));
      return { map: serverMap };
    },
  });
  const options = { mapId: 1, canEdit: true };
  const history = harness.render(options);
  await history.run('earlier edit', async () => {
    serverMap = { ...serverMap, name: 'Earlier name', contentFingerprint: 'earlier' };
    return serverMap;
  });
  assert.equal(harness.render(options).canUndo, true);
  const media = history.run('upload', async () => {
    await mediaReady.promise;
    serverMap = { ...serverMap, media: ['uploaded file'], contentFingerprint: 'media' };
    return serverMap;
  }, { record: false });
  const metadata = history.run('queued name edit', async (expectedFingerprint) => {
    assert.equal(expectedFingerprint, 'media', 'the queued edit captures content after the upload');
    serverMap = { ...serverMap, name: 'Queued name', contentFingerprint: 'metadata' };
    return serverMap;
  });
  const completed = Promise.all([media, metadata]);
  mediaReady.resolve();
  await completed;
  assert.equal(serverMap.name, 'Queued name');
  assert.equal(harness.render(options).canUndo, true);
  assert.equal(await harness.render(options).undo(), true);
  assert.equal(serverMap.name, 'Earlier name');
  assert.deepEqual(serverMap.media, ['uploaded file'], 'undo affects only the later metadata edit');
  assert.equal(await harness.render(options).undo(), false, 'history before the media change was cleared');
  harness.unmount();
});
