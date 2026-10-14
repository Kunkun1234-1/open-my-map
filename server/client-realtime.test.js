import test from 'node:test';
import assert from 'node:assert/strict';
import { connectMapRoom } from '../src/realtime.js';

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
