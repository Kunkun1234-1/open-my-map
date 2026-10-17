import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function availablePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function startServer(directory) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(directory, 'story.sqlite'),
      UPLOAD_DIR: path.join(directory, 'uploads'),
      UPLOAD_TEMP_DIR: path.join(directory, 'upload-temp'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10_000);
    const done = (error) => {
      clearTimeout(timeout);
      child.off('error', done);
      child.off('exit', exited);
      if (error) reject(error); else resolve();
    };
    const exited = (code) => done(new Error(`Server exited (${code}): ${output}`));
    child.once('error', done);
    child.once('exit', exited);
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('Open My Map server listening')) done();
    });
  }).catch((error) => { child.kill(); throw error; });
  return { child, url: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws` };
}

function waitForMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', listener);
      reject(new Error('Realtime story-order update did not arrive'));
    }, 3000);
    const listener = (raw) => {
      const message = JSON.parse(String(raw));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off('message', listener);
      resolve(message);
    };
    socket.on('message', listener);
  });
}

test('map story order is guarded, shared, and checkpointed without moving features', { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-story-order-'));
  let server;
  let socket;
  try {
    server = await startServer(directory);
    const request = async (method, endpoint, session, body) => {
      const headers = session ? { authorization: `Bearer ${session}` } : {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${endpoint}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, value: response.status === 204 ? null : await response.json() };
    };
    const register = async (name) => {
      const result = await request('POST', '/api/auth/register', null, {
        name, email: `${name}@example.com`, password: 'secret1',
      });
      assert.equal(result.status, 201);
      return result.value;
    };
    const owner = await register('story-owner');
    const editor = await register('story-editor');
    const viewer = await register('story-viewer');
    const admin = (await request('POST', '/api/auth/login', null, {
      email: 'admin@openmymap.local', password: 'admin123',
    })).value;
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Story project' })).value;
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      assert.equal((await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
        email: account.user.email, role,
      })).status, 201);
    }
    const map = (await request('POST', '/api/maps', owner.sessionId, { name: 'Story map', projectId: project.id })).value;
    const otherMap = (await request('POST', '/api/maps', owner.sessionId, { name: 'Other map', projectId: project.id })).value;
    const endpoint = `/api/maps/${map.id}`;
    const get = async () => (await request('GET', endpoint, owner.sessionId)).value;
    const addLayer = await request('POST', `${endpoint}/layers`, owner.sessionId, { name: 'Second layer' });
    const layerA = map.layers[0].id;
    const layerB = addLayer.value.layers[1].id;
    const addFeature = async (layerId, name) => {
      const result = await request('POST', `/api/layers/${layerId}/features`, owner.sessionId, {
        name, geometry: { type: 'Point', coordinates: [121.47, 31.23] },
      });
      assert.equal(result.status, 201);
      return result.value.createdFeatureId;
    };
    const featureA = await addFeature(layerA, 'A');
    const featureB = await addFeature(layerA, 'B');
    const featureC = await addFeature(layerB, 'C');
    const otherFeature = await addFeature(otherMap.layers[0].id, 'Other');

    await t.test('cross-layer order persists, is public, and preserves layer ownership and positions', async () => {
      socket = new WebSocket(`${server.wsUrl}?token=${editor.sessionId}`);
      await once(socket, 'open');
      const joined = waitForMessage(socket, (message) => message.type === 'joined');
      socket.send(JSON.stringify({ type: 'join', mapId: map.id }));
      await joined;
      const before = await get();
      const original = before.layers.flatMap((layer) => layer.features.map((feature) => [feature.id, feature.layer_id, feature.position]));
      const broadcast = waitForMessage(socket, (message) => message.action === 'map.updated');
      const saved = await request('POST', `${endpoint}/story-order`, editor.sessionId, {
        featureIds: [featureC, featureA, featureB],
        expectedVersion: before.version,
        expectedFingerprint: before.contentFingerprint,
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.value.story_order, [featureC, featureA, featureB]);
      assert.notEqual(saved.value.contentFingerprint, before.contentFingerprint);
      assert.deepEqual(saved.value.layers.flatMap((layer) => layer.features.map((feature) => [feature.id, feature.layer_id, feature.position])), original);
      const op = await broadcast;
      assert.deepEqual(op.entity.story_order, saved.value.story_order);
      assert.equal(op.contentFingerprint, saved.value.contentFingerprint);
      const share = await request('POST', `${endpoint}/share`, owner.sessionId, { access: 'view' });
      const publicMap = await request('GET', `/api/public/${share.value.token}`, null);
      assert.equal(publicMap.status, 200);
      assert.deepEqual(publicMap.value.story_order, [featureC, featureA, featureB]);
      const direct = new DatabaseSync(path.join(directory, 'story.sqlite'));
      assert.deepEqual(JSON.parse(direct.prepare('SELECT story_order_json FROM maps WHERE id = ?').get(map.id).story_order_json), [featureC, featureA, featureB]);
      direct.close();
    });

    await t.test('invalid permutations, permissions, version, and fingerprint fail atomically', async () => {
      const before = await get();
      for (const featureIds of [
        [featureA, featureB],
        [featureA, featureA, featureC],
        [featureA, featureB, otherFeature],
        [featureA, featureB, 'bad'],
      ]) {
        const result = await request('POST', `${endpoint}/story-order`, owner.sessionId, {
          featureIds, expectedVersion: before.version, expectedFingerprint: before.contentFingerprint,
        });
        assert.equal(result.status, 400);
        assert.deepEqual((await get()).story_order, before.story_order);
      }
      assert.equal((await request('POST', `${endpoint}/story-order`, null, { featureIds: before.story_order })).status, 401);
      assert.equal((await request('POST', `${endpoint}/story-order`, viewer.sessionId, { featureIds: before.story_order })).status, 403);
      for (const body of [
        { featureIds: before.story_order },
        { featureIds: before.story_order, expectedVersion: before.version },
        { featureIds: before.story_order, expectedFingerprint: before.contentFingerprint },
      ]) {
        assert.equal((await request('POST', `${endpoint}/story-order`, owner.sessionId, body)).status, 428);
        const unchanged = await get();
        assert.deepEqual(unchanged.story_order, before.story_order);
        assert.equal(unchanged.version, before.version);
        assert.equal(unchanged.updated_at, before.updated_at);
        assert.equal(unchanged.contentFingerprint, before.contentFingerprint);
      }
      for (const guards of [
        { expectedVersion: 0, expectedFingerprint: before.contentFingerprint },
        { expectedVersion: -1, expectedFingerprint: before.contentFingerprint },
        { expectedVersion: 1.5, expectedFingerprint: before.contentFingerprint },
        { expectedVersion: String(before.version), expectedFingerprint: before.contentFingerprint },
        { expectedVersion: before.version, expectedFingerprint: 'invalid' },
        { expectedVersion: before.version, expectedFingerprint: 'A'.repeat(64) },
      ]) {
        assert.equal((await request('POST', `${endpoint}/story-order`, owner.sessionId, {
          featureIds: before.story_order, ...guards,
        })).status, 400);
        const unchanged = await get();
        assert.deepEqual(unchanged.story_order, before.story_order);
        assert.equal(unchanged.version, before.version);
        assert.equal(unchanged.updated_at, before.updated_at);
        assert.equal(unchanged.contentFingerprint, before.contentFingerprint);
      }
      assert.equal((await request('POST', `${endpoint}/story-order`, owner.sessionId, {
        featureIds: before.story_order, expectedVersion: before.version - 1, expectedFingerprint: before.contentFingerprint,
      })).status, 409);
      assert.equal((await request('POST', `${endpoint}/story-order`, owner.sessionId, {
        featureIds: before.story_order, expectedVersion: before.version, expectedFingerprint: '0'.repeat(64),
      })).status, 409);
      assert.deepEqual((await get()).story_order, before.story_order);
      const adminSave = await request('POST', `${endpoint}/story-order`, admin.sessionId, {
        featureIds: [featureB, featureC, featureA], expectedVersion: before.version, expectedFingerprint: before.contentFingerprint,
      });
      assert.equal(adminSave.status, 200);
    });

    await t.test('empty maps accept an empty order and checkpoints restore story order', async () => {
      const emptyMap = (await request('POST', '/api/maps', owner.sessionId, { name: 'Empty story', projectId: project.id })).value;
      const emptySave = await request('POST', `/api/maps/${emptyMap.id}/story-order`, owner.sessionId, {
        featureIds: [], expectedVersion: emptyMap.version, expectedFingerprint: emptyMap.contentFingerprint,
      });
      assert.equal(emptySave.status, 200);
      assert.deepEqual(emptySave.value.story_order, []);

      const current = await get();
      const checkpoint = await request('POST', `${endpoint}/checkpoints`, owner.sessionId, {
        expectedFingerprint: current.contentFingerprint,
      });
      assert.equal(checkpoint.status, 201);
      const changed = await request('POST', `${endpoint}/story-order`, owner.sessionId, {
        featureIds: [featureA, featureB, featureC],
        expectedVersion: current.version,
        expectedFingerprint: current.contentFingerprint,
      });
      assert.equal(changed.status, 200);
      const restored = await request('POST', `${endpoint}/restore-checkpoint`, owner.sessionId, {
        token: checkpoint.value.token,
        expectedFingerprint: changed.value.contentFingerprint,
      });
      assert.equal(restored.status, 200);
      assert.deepEqual(restored.value.map.story_order, current.story_order);
      assert.equal(restored.value.fingerprint, current.contentFingerprint);
    });
  } finally {
    if (socket) socket.close();
    if (server?.child) {
      server.child.kill();
      await once(server.child, 'exit').catch(() => {});
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
