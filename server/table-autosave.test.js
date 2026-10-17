import assert from 'node:assert/strict';
import test from 'node:test';
import { createTableAutosave } from '../src/components/editor/table-autosave.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('debounce coalesces repeated edits to one cell', async () => {
  const calls = [];
  const autosave = createTableAutosave({
    delay: 10,
    save: async (request) => { calls.push(request); return request.value; },
  });
  autosave.change(1, 'name', 'A', 'Original');
  autosave.change(1, 'name', 'AB', 'Original');
  autosave.change(1, 'name', 'ABC', 'Original');
  await wait(30);
  assert.deepEqual(calls, [{ featureId: 1, field: 'name', value: 'ABC', baseValue: 'Original' }]);
  assert.equal(autosave.snapshot().dirty, false);
  await autosave.dispose();
});

test('deferred composition updates the draft without scheduling intermediate writes', async () => {
  const calls = [];
  const autosave = createTableAutosave({
    delay: 10,
    save: async (request) => { calls.push(request); return request.value; },
  });
  autosave.change(3, 'name', '上', '', { defer: true });
  autosave.change(3, 'name', '上海', '', { defer: true });
  await wait(25);
  assert.equal(autosave.read(3, 'name', ''), '上海');
  assert.equal(calls.length, 0);
  autosave.change(3, 'name', '上海', '');
  await wait(25);
  assert.deepEqual(calls, [{ featureId: 3, field: 'name', value: '上海', baseValue: '' }]);
  await autosave.dispose();
});

test('an in-flight acknowledgement cannot drain a deferred composition value', async () => {
  const first = deferred();
  const calls = [];
  const autosave = createTableAutosave({
    delay: 10,
    save: (request) => {
      calls.push(request);
      return calls.length === 1 ? first.promise : Promise.resolve(request.value);
    },
  });
  autosave.change(8, 'name', 'initial edit', 'original');
  const flushing = autosave.flush();
  await Promise.resolve();
  autosave.change(8, 'name', '中', 'original', { defer: true });
  autosave.change(8, 'name', '中文', 'original', { defer: true });
  first.resolve('initial edit');
  assert.equal(await flushing, true);
  await wait(25);
  assert.equal(calls.length, 1);
  assert.equal(autosave.read(8, 'name', ''), '中文');
  autosave.change(8, 'name', '中文', 'original');
  await wait(25);
  assert.deepEqual(calls[1], { featureId: 8, field: 'name', value: '中文', baseValue: 'initial edit' });
  await autosave.dispose();
});

test('same-cell edits made during a request save after its acknowledged value', async () => {
  const first = deferred();
  const calls = [];
  const autosave = createTableAutosave({
    delay: 1000,
    save: (request) => {
      calls.push(request);
      return calls.length === 1 ? first.promise : Promise.resolve(request.value);
    },
  });
  autosave.change(4, 'description', 'first', 'old');
  const flushing = autosave.flush();
  await Promise.resolve();
  autosave.change(4, 'description', 'second', 'old');
  first.resolve('first-normalized');
  assert.equal(await flushing, true);
  assert.deepEqual(calls, [
    { featureId: 4, field: 'description', value: 'first', baseValue: 'old' },
    { featureId: 4, field: 'description', value: 'second', baseValue: 'first-normalized' },
  ]);
  assert.equal(autosave.read(4, 'description', ''), 'second');
  await autosave.dispose();
});

test('different rows and fields are always saved serially', async () => {
  let active = 0;
  let maximumActive = 0;
  const order = [];
  const autosave = createTableAutosave({
    delay: 1000,
    save: async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push(`${request.featureId}:${request.field}`);
      await wait(2);
      active -= 1;
      return request.value;
    },
  });
  autosave.change(1, 'name', 'One', 'Old one');
  autosave.change(1, 'description', 'Description', 'Old description');
  autosave.change(2, 'name', 'Two', 'Old two');
  assert.equal(await autosave.flush(), true);
  assert.equal(maximumActive, 1);
  assert.deepEqual(order, ['1:name', '1:description', '2:name']);
  await autosave.dispose();
});

test('failure retains the draft and explicit flush retries against latestValue', async () => {
  const calls = [];
  const autosave = createTableAutosave({
    delay: 1000,
    save: async (request) => {
      calls.push(request);
      if (calls.length === 1) throw Object.assign(new Error('conflict'), { latestValue: 'Remote' });
      return request.value;
    },
  });
  autosave.change(7, 'name', 'Local', 'Original');
  assert.equal(await autosave.flush(), false);
  assert.deepEqual(autosave.snapshot().fields[0], {
    featureId: 7,
    field: 'name',
    value: 'Local',
    savedValue: 'Remote',
    status: 'error',
    error: 'conflict',
  });
  assert.equal(await autosave.flush(), true);
  assert.deepEqual(calls[1], { featureId: 7, field: 'name', value: 'Local', baseValue: 'Remote' });
  await autosave.dispose();
});

test('discard clears a permanent error and dispose performs no further writes', async () => {
  let requests = 0;
  const autosave = createTableAutosave({
    delay: 1000,
    save: async () => {
      requests += 1;
      throw new Error('permanent failure');
    },
  });
  autosave.change(12, 'description', 'Unsaved draft', 'Persisted value');
  assert.equal(await autosave.flush(), false);
  assert.equal(requests, 1);
  assert.equal(autosave.discard(), true);
  const snapshot = autosave.snapshot();
  assert.equal(snapshot.dirty, false);
  assert.equal(snapshot.error, '');
  assert.deepEqual(snapshot.fields[0], {
    featureId: 12,
    field: 'description',
    value: 'Persisted value',
    savedValue: 'Persisted value',
    status: 'clean',
    error: '',
  });
  assert.equal(await autosave.dispose(), true);
  assert.equal(requests, 1);
});

test('server normalization becomes both the displayed and saved value', async () => {
  const autosave = createTableAutosave({
    delay: 1000,
    save: async ({ value }) => value.trim(),
  });
  autosave.change('a', 'name', '  Normalized  ', 'Before');
  assert.equal(await autosave.flush(), true);
  assert.equal(autosave.read('a', 'name', ''), 'Normalized');
  assert.equal(autosave.snapshot().fields[0].savedValue, 'Normalized');
  await autosave.dispose();
});

test('sync refreshes clean cells but never clobbers dirty drafts', async () => {
  const autosave = createTableAutosave({ delay: 1000, save: async ({ value }) => value });
  autosave.change(1, 'name', 'Initial', 'Initial');
  autosave.change(2, 'description', 'Local draft', 'Old remote');
  autosave.sync([
    { id: 1, name: 'Remote clean', description: '' },
    { id: 2, name: '', description: 'New remote' },
  ]);
  assert.equal(autosave.read(1, 'name', ''), 'Remote clean');
  assert.equal(autosave.read(2, 'description', ''), 'Local draft');
  await autosave.flush();
  await autosave.dispose();
});

test('sync refreshes clean custom cells without clobbering custom drafts', async () => {
  const autosave = createTableAutosave({ delay: 1000, save: async ({ value }) => value });
  autosave.change(1, 'data:col_owner', 'Old owner', 'Old owner');
  autosave.change(2, 'data:col_owner', 'Local owner', 'Old remote');
  autosave.sync([
    { id: 1, properties: { col_owner: 'Remote owner' } },
    { id: 2, properties: { col_owner: 'New remote' } },
  ]);
  assert.equal(autosave.read(1, 'data:col_owner', ''), 'Remote owner');
  assert.equal(autosave.read(2, 'data:col_owner', ''), 'Local owner');
  assert.equal(await autosave.flush(), true);
  await autosave.dispose();
});

test('custom drafts in flight are not replaced by remote sync', async () => {
  const request = deferred();
  const autosave = createTableAutosave({ delay: 1000, save: () => request.promise });
  autosave.change(3, 'data:col_code', '00123', '00001');
  const flushing = autosave.flush();
  await Promise.resolve();
  autosave.sync([{ id: 3, properties: { col_code: '99999' } }]);
  assert.equal(autosave.read(3, 'data:col_code', ''), '00123');
  request.resolve('00123');
  assert.equal(await flushing, true);
  await autosave.dispose();
});

test('different custom fields save serially', async () => {
  let active = 0;
  let maximumActive = 0;
  const order = [];
  const autosave = createTableAutosave({
    delay: 1000,
    save: async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push(request.field);
      await wait(2);
      active -= 1;
      return request.value;
    },
  });
  autosave.change(5, 'data:col_owner', 'Owner', '');
  autosave.change(5, 'data:col_code', '00123', '');
  assert.equal(await autosave.flush(), true);
  assert.equal(maximumActive, 1);
  assert.deepEqual(order, ['data:col_owner', 'data:col_code']);
  await autosave.dispose();
});

test('dispose flushes the final debounced draft without further notifications', async () => {
  const calls = [];
  const notifications = [];
  const autosave = createTableAutosave({
    delay: 1000,
    save: async (request) => { calls.push(request); return request.value; },
    onChange: (snapshot) => notifications.push(snapshot),
  });
  autosave.change(9, 'description', 'Final draft', 'Before');
  const notificationCount = notifications.length;
  assert.equal(await autosave.dispose(), true);
  assert.deepEqual(calls, [{ featureId: 9, field: 'description', value: 'Final draft', baseValue: 'Before' }]);
  assert.equal(notifications.length, notificationCount);
});
