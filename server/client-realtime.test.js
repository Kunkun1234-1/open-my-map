import test from 'node:test';
import assert from 'node:assert/strict';
import { connectMapRoom, applyMapOp } from '../src/realtime.js';

function withSocketFixture(t) {
  const previousWindow = globalThis.window;
  const previousSocket = globalThis.WebSocket;
  class Socket extends EventTarget {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances = [];
    constructor() {
      super();
      this.readyState = 0;
      this.sent = [];
      Socket.instances.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    fire(type, data) {
      this.dispatchEvent(
        type === 'message'
          ? new MessageEvent(type, { data: JSON.stringify(data) })
          : new Event(type),
      );
    }
    open() {
      this.readyState = Socket.OPEN;
      this.fire('open');
    }
    close() {
      this.readyState = 3;
      this.fire('close');
    }
  }
  globalThis.window = {
    location: { protocol: 'http:', host: 'localhost' },
    localStorage: { getItem: () => '' },
  };
  globalThis.WebSocket = Socket;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.WebSocket = previousSocket;
  });
  return Socket;
}

test('closing a connecting collaboration room ignores late events and does not reconnect', (t) => {
  const Socket = withSocketFixture(t);
  const statuses = [],
    operations = [];
  const room = connectMapRoom(1, {
    onStatus: (status) => statuses.push(status),
    onOp: (op) => operations.push(op),
  });
  const socket = Socket.instances[0];
  room.close();
  socket.fire('error');
  socket.open();
  socket.fire('message', { type: 'op', action: 'map.deleted' });
  t.mock.timers.tick(30_000);
  assert.deepEqual(statuses, ['connecting']);
  assert.deepEqual(operations, []);
  assert.deepEqual(socket.sent, []);
  assert.equal(Socket.instances.length, 1);
  assert.equal(socket.readyState, 3);
});

test('events from a replaced collaboration socket do not disturb the active room', (t) => {
  const Socket = withSocketFixture(t);
  const statuses = [],
    presences = [],
    operations = [];
  const room = connectMapRoom(2, {
    onStatus: (status) => statuses.push(status),
    onPresence: (peers) => presences.push(peers),
    onOp: (op) => operations.push(op),
  });
  t.after(() => room.close());
  const first = Socket.instances[0];
  first.open();
  assert.deepEqual(first.sent[0], { type: 'join', mapId: 2 });
  first.close();
  t.mock.timers.tick(800);
  const second = Socket.instances[1];
  second.open();
  const currentStatuses = [...statuses];
  first.fire('error');
  first.fire('close');
  first.fire('message', { type: 'op', action: 'map.deleted' });
  first.fire('message', { type: 'presence.sync', peers: [{ id: 99 }] });
  assert.deepEqual(statuses, currentStatuses);
  assert.deepEqual(operations, []);
  assert.deepEqual(presences, []);
  second.fire('message', { type: 'joined', canEdit: true, peers: [{ id: 1 }] });
  assert.equal(room.canEdit, true);
  assert.deepEqual(presences, [[{ id: 1 }]]);
  t.mock.timers.tick(25_000);
  assert.deepEqual(second.sent, [{ type: 'join', mapId: 2 }, { type: 'ping' }]);
  assert.equal(Socket.instances.length, 2);
});

function fixture() {
  return {
    id: 7,
    name: 'Current map',
    version: 10,
    contentFingerprint: 'current-fingerprint',
    layers: [
      { id: 1, name: 'First layer', position: 0, version: 4, style: { color: 'blue' }, features: [
        { id: 30, layer_id: 1, name: 'Custom first', position: 0, version: 2, geometry: { type: 'Point', coordinates: [120, 30] }, attachments: [] },
        { id: 10, layer_id: 1, name: 'Custom middle', position: 1, version: 8, attachments: [{ id: 1 }] },
        { id: 20, layer_id: 1, name: 'Custom last', position: 2, version: 3, attachments: [] },
      ] },
      { id: 2, name: 'Second layer', position: 1, version: 2, features: [
        { id: 50, layer_id: 2, name: 'Destination row', position: 0, version: 1, attachments: [] },
      ] },
    ],
  };
}

const featureIds = (map, layerId = 1) => map.layers.find((layer) => layer.id === layerId).features.map((feature) => feature.id);

test('editing a feature or its media preserves persisted custom order without mutating the input', () => {
  for (const action of ['feature.updated', 'attachment.created', 'attachment.deleted']) {
    const before = fixture();
    const untouched = structuredClone(before);
    const entity = { ...before.layers[0].features[1], name: 'Updated middle', version: 9 };
    const after = applyMapOp(before, { action, mapId: 7, entity, version: 9, mapVersion: 11, contentFingerprint: 'new-fingerprint' });
    assert.deepEqual(featureIds(after), [30, 10, 20]);
    assert.equal(after.layers[0].features[1].name, 'Updated middle');
    assert.equal(after.version, 11);
    assert.equal(after.contentFingerprint, 'new-fingerprint');
    assert.deepEqual(before, untouched);
  }
});

test('feature partial updates retain their layer, geometry, attachments and position', () => {
  const before = fixture();
  const after = applyMapOp(before, { action: 'feature.updated', version: 3, entity: { id: 30, name: 'Renamed' } });
  assert.deepEqual(featureIds(after), [30, 10, 20]);
  assert.deepEqual(after.layers[0].features[0], { ...before.layers[0].features[0], name: 'Renamed', version: 3 });
  assert.equal(after.version, before.version, 'a feature version is not a map version');
});

test('feature insertion and layer moves use position then id and never duplicate a feature', () => {
  const before = fixture();
  const inserted = applyMapOp(before, { action: 'feature.created', entity: { id: 40, layer_id: 1, position: 1, version: 1 }, mapVersion: 11 });
  assert.deepEqual(featureIds(inserted), [30, 10, 40, 20]);
  const moved = applyMapOp(inserted, { action: 'feature.updated', entity: { id: 30, layer_id: 2, position: 1, version: 3 }, mapVersion: 12 });
  assert.deepEqual(featureIds(moved), [10, 40, 20]);
  assert.deepEqual(featureIds(moved, 2), [50, 30]);
  assert.equal(moved.layers.flatMap((layer) => layer.features).filter((feature) => feature.id === 30).length, 1);
});

test('layer partial changes preserve feature rows and follow persisted layer position', () => {
  const before = fixture();
  const after = applyMapOp(before, { action: 'layer.updated', entity: { id: 2, name: 'Renamed second', position: 0, version: 3 }, mapVersion: 11 });
  assert.deepEqual(after.layers.map((layer) => layer.id), [1, 2], 'equal positions use id as server ordering does');
  assert.deepEqual(featureIds(after, 2), [50]);
  const inserted = applyMapOp(after, { action: 'layer.created', entity: { id: 3, name: 'New first', position: -1, version: 1 }, mapVersion: 12 });
  assert.deepEqual(inserted.layers.map((layer) => layer.id), [3, 1, 2]);
  assert.deepEqual(inserted.layers[0].features, []);
});

test('late full maps cannot overwrite a newer HTTP snapshot, using map versions only', () => {
  const current = fixture();
  const oldMap = { ...structuredClone(current), name: 'Old map', version: 9 };
  assert.equal(applyMapOp(current, { action: 'map.updated', entity: oldMap, version: 9 }), current);
  assert.equal(applyMapOp(current, { action: 'map.updated', entity: oldMap, mapVersion: 9 }), current);
  const newerMap = { ...structuredClone(current), name: 'New map', version: 11, contentFingerprint: 'fresh' };
  const after = applyMapOp(current, { action: 'map.updated', entity: newerMap, version: 11, mapVersion: 11, contentFingerprint: 'fresh' });
  assert.equal(after.name, 'New map');
  assert.equal(after.version, 11);
  assert.equal(after.contentFingerprint, 'fresh');
  assert.deepEqual(featureIds(after), [30, 10, 20]);
});

test('partial envelopes advance map version and fingerprint and reject late edits and deletions', () => {
  const current = fixture();
  const updated = applyMapOp(current, { action: 'feature.updated', entity: { id: 10, name: 'Fresh edit', version: 9 }, version: 9, mapVersion: 12, contentFingerprint: 'fingerprint-12' });
  assert.equal(updated.version, 12);
  assert.equal(updated.layers[0].features[1].version, 9, 'map and entity versions remain independent');
  for (const op of [
    { action: 'feature.updated', entity: { id: 10, layer_id: 1, name: 'Late edit', version: 100 }, version: 100 },
    { action: 'layer.updated', entity: { id: 1, name: 'Late layer', version: 100 }, version: 100 },
    { action: 'feature.deleted', entityId: 10 },
    { action: 'layer.deleted', entityId: 1 },
  ]) {
    assert.equal(applyMapOp(updated, { ...op, mapVersion: 11, contentFingerprint: 'stale' }), updated);
  }
  const deleted = applyMapOp(updated, { action: 'feature.deleted', entityId: 10, mapVersion: 13, contentFingerprint: 'fingerprint-13' });
  assert.deepEqual(featureIds(deleted), [30, 20]);
  assert.equal(deleted.version, 13);
  assert.equal(deleted.contentFingerprint, 'fingerprint-13');
});

test('legacy partial events compare same-entity versions without comparing them with map version', () => {
  const current = fixture();
  const newerFeature = applyMapOp(current, { action: 'feature.updated', entity: { id: 10, name: 'Valid feature', version: 9 }, version: 9 });
  assert.equal(newerFeature.layers[0].features[1].name, 'Valid feature');
  assert.equal(newerFeature.version, 10);
  assert.equal(applyMapOp(newerFeature, { action: 'feature.updated', entity: { id: 10, name: 'Old feature', version: 8 }, version: 100 }), newerFeature);
  assert.equal(applyMapOp(current, { action: 'layer.updated', entity: { id: 1, name: 'Old layer', version: 3 } }), current);
  const newerLayer = applyMapOp(current, { action: 'layer.updated', entity: { id: 1, name: 'Valid layer' }, version: 5 });
  assert.equal(newerLayer.layers[0].version, 5);
  assert.equal(newerLayer.version, 10);
});

test('legacy full snapshots also refuse to downgrade newer partial entity content', () => {
  const current = fixture();
  const partial = applyMapOp(current, { action: 'feature.updated', entity: { id: 10, name: 'New geometry', version: 9 } });
  const outdatedEntities = { ...structuredClone(current), version: 11 };
  assert.equal(applyMapOp(partial, { action: 'map.updated', entity: outdatedEntities, version: 11 }), partial);
  assert.equal(applyMapOp(partial, { action: 'layer.updated', entity: { ...current.layers[0], version: 5 } }), partial);
});

test('map deletion remains effective regardless of old version metadata, while other maps are ignored', () => {
  const current = fixture();
  assert.equal(applyMapOp(current, { action: 'map.deleted', mapId: 7, mapVersion: 1 }), null);
  assert.equal(applyMapOp(current, { action: 'map.deleted', mapId: 8 }), current);
  assert.equal(applyMapOp(current, { action: 'feature.updated', mapId: 8, entity: { id: 10, name: 'Other map', version: 99 }, mapVersion: 20 }), current);
});
