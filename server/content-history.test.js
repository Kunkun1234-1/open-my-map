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

async function startServer(directory) {
  const portServer = net.createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env, PORT: String(port), DB_PATH: path.join(directory, 'content.sqlite'),
      UPLOAD_DIR: path.join(directory, 'uploads'), UPLOAD_TEMP_DIR: path.join(directory, 'upload-temp'),
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
      reject(new Error('Realtime map update did not arrive'));
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

test('atomic ordering, uniform styles and conflict-safe content history', { timeout: 45_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-content-test-'));
  let server;
  let socket;
  let directDb;
  try {
    server = await startServer(directory);
    const request = async (method, endpoint, session, body) => {
      const headers = session ? { authorization: `Bearer ${session}` } : {};
      if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${endpoint}`, {
        method, headers,
        body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, value: response.status === 204 ? null : await response.json() };
    };
    const register = async (name) => (await request('POST', '/api/auth/register', null, {
      name, email: `${name}@example.com`, password: 'secret1',
    })).value;
    const owner = await register('content-owner');
    const editor = await register('content-editor');
    const viewer = await register('content-viewer');
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Content project' })).value;
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      assert.equal((await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, { email: account.user.email, role })).status, 201);
    }
    const makeMap = async (name) => (await request('POST', '/api/maps', owner.sessionId, { name, projectId: project.id })).value;
    const map = await makeMap('Editable map');
    const otherMap = await makeMap('Other map');
    const endpoint = `/api/maps/${map.id}`;
    const get = async () => (await request('GET', endpoint, owner.sessionId)).value;
    const checkpoint = async (body = {}) => {
      const result = await request('POST', `${endpoint}/checkpoints`, owner.sessionId, body);
      assert.equal(result.status, 201);
      return result.value;
    };
    const restore = (token, expectedFingerprint, session = owner.sessionId, target = endpoint) => request('POST', `${target}/restore-checkpoint`, session, { token, expectedFingerprint });
    const layerA = map.layers[0].id;
    const withLayer = (await request('POST', `${endpoint}/layers`, owner.sessionId, { name: 'Other layer' })).value;
    const layerB = withLayer.layers[1].id;
    assert.equal(withLayer.createdLayerId, layerB);
    assert.equal((await get()).contentFingerprint, withLayer.contentFingerprint);
    const addFeature = async (layerId, name, geometry, style = {}) => {
      const result = await request('POST', `/api/layers/${layerId}/features`, owner.sessionId, { name, geometry, style });
      assert.equal(result.status, 201);
      const created = result.value.layers.find((layer) => layer.id === layerId).features.at(-1);
      assert.equal(result.value.createdFeatureId, created.id);
      assert.match(result.value.contentFingerprint, /^[a-f0-9]{64}$/);
      return result.value.createdFeatureId;
    };
    const point = { type: 'Point', coordinates: [121.47, 31.23] };
    const featureA = await addFeature(layerA, 'First point', point, { color: '#111111', icon: 'camera', customNote: 'keep' });
    const featureB = await addFeature(layerA, 'Second point', point);
    const featureC = await addFeature(layerB, 'Area', {
      type: 'Polygon', coordinates: [[[121.47, 31.23], [121.48, 31.23], [121.48, 31.24], [121.47, 31.23]]],
    }, { fillColor: '#123456', fillOpacity: 0.4, weight: 2 });
    const feature = (value, featureId) => value.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId);

    await t.test('ordering persists and rejects incomplete, duplicate or cross-map IDs atomically', async () => {
      let current = await get();
      assert.deepEqual(current.layers[0].features.map((item) => item.position), [0, 1]);
      for (const layerIds of [[layerA], [layerA, layerA], [layerA, otherMap.layers[0].id]]) {
        assert.equal((await request('POST', `${endpoint}/reorder`, owner.sessionId, { layerIds })).status, 400);
        assert.equal((await get()).contentFingerprint, current.contentFingerprint);
      }
      current = (await request('POST', `${endpoint}/reorder`, owner.sessionId, { layerIds: [layerB, layerA], expectedVersion: current.version })).value;
      assert.deepEqual(current.layers.map((layer) => layer.id), [layerB, layerA]);
      assert.deepEqual((await get()).layers.map((layer) => layer.position), [0, 1]);
      const stale = await request('POST', `${endpoint}/reorder`, owner.sessionId, { layerIds: [layerA, layerB], expectedVersion: current.version - 1 });
      assert.equal(stale.status, 409);
      assert.equal(stale.value.conflict, true);
      assert.equal(stale.value.latest.id, map.id);
      for (const featureIds of [[featureA], [featureA, featureA], [featureA, featureC]]) {
        assert.equal((await request('POST', `${endpoint}/features/reorder`, owner.sessionId, { layerId: layerA, featureIds })).status, 400);
      }
      current = (await request('POST', `${endpoint}/features/reorder`, owner.sessionId, { layerId: layerA, featureIds: [featureB, featureA] })).value;
      assert.deepEqual(current.layers.find((layer) => layer.id === layerA).features.map((item) => item.id), [featureB, featureA]);
      assert.equal((await request('POST', `${endpoint}/features/reorder`, owner.sessionId, { layerId: otherMap.layers[0].id, featureIds: [] })).status, 400);
    });

    await t.test('feature moves reorder both layers and never move into another map', async () => {
      const before = await get();
      assert.equal((await request('POST', `/api/features/${featureA}/move`, owner.sessionId, { layerId: otherMap.layers[0].id, index: 0 })).status, 400);
      assert.equal((await request('POST', `/api/features/${featureA}/move`, owner.sessionId, { layerId: layerB, index: 3 })).status, 400);
      assert.equal((await get()).contentFingerprint, before.contentFingerprint);
      const result = await request('POST', `/api/features/${featureA}/move`, owner.sessionId, { layerId: layerB, index: 0, expectedVersion: feature(before, featureA).version });
      assert.equal(result.status, 200);
      assert.deepEqual(result.value.layers.find((layer) => layer.id === layerB).features.map((item) => [item.id, item.position]), [[featureA, 0], [featureC, 1]]);
      assert.deepEqual(result.value.layers.find((layer) => layer.id === layerA).features.map((item) => [item.id, item.position]), [[featureB, 0]]);
      assert.equal((await request('POST', `/api/features/${featureA}/move`, owner.sessionId, { layerId: layerA, index: 0, expectedVersion: feature(before, featureA).version })).status, 409);
    });

    await t.test('uniform style is atomic, preserves per-feature data, and broadcasts full map', async () => {
      socket = new WebSocket(`${server.wsUrl}?token=${editor.sessionId}`);
      await once(socket, 'open');
      const joined = waitForMessage(socket, (message) => message.type === 'joined');
      socket.send(JSON.stringify({ type: 'join', mapId: map.id }));
      await joined;
      const before = await get();
      const version = before.layers.find((layer) => layer.id === layerB).version;
      const broadcast = waitForMessage(socket, (message) => message.action === 'map.updated');
      const result = await request('PATCH', `/api/layers/${layerB}/style`, owner.sessionId, {
        style: { color: '#e85d4a', icon: 'food', weight: 5 }, applyToFeatures: true, expectedVersion: version,
      });
      assert.equal(result.status, 200);
      const op = await broadcast;
      assert.equal(op.entity.contentFingerprint, result.value.contentFingerprint);
      assert.equal(op.mapVersion, result.value.version);
      assert.equal(op.contentFingerprint, result.value.contentFingerprint);
      assert.equal(feature(result.value, featureA).style.customNote, 'keep');
      assert.equal(feature(result.value, featureA).style.icon, 'food');
      assert.equal(feature(result.value, featureC).style.fillColor, '#e85d4a');
      assert.equal(feature(result.value, featureC).style.fillOpacity, 0.4);
      assert.equal(feature(result.value, featureC).style.weight, 5);
      assert.equal(feature(result.value, featureC).style.icon, undefined);
      assert.ok(feature(result.value, featureC).version > feature(before, featureC).version);
      assert.equal((await request('PATCH', `/api/layers/${layerB}/style`, owner.sessionId, { style: { color: '#ffffff' }, applyToFeatures: true, expectedVersion: version })).status, 409);
      const fingerprint = result.value.contentFingerprint;
      assert.equal((await request('PATCH', `/api/layers/${layerB}/style`, owner.sessionId, { style: { weight: -1 }, applyToFeatures: true })).status, 400);
      assert.equal((await get()).contentFingerprint, fingerprint);
    });

    await t.test('partial entity updates carry the latest map version and fingerprint without changing entity semantics', async () => {
      const before = await get();
      const featureBroadcast = waitForMessage(socket, (message) => message.action === 'feature.updated');
      const result = await request('PATCH', `/api/features/${featureB}`, owner.sessionId, { description: 'Partial realtime update' });
      assert.equal(result.status, 200);
      const featureOp = await featureBroadcast;
      assert.equal(featureOp.entity.id, featureB);
      assert.equal(featureOp.version, feature(result.value, featureB).version);
      assert.equal(featureOp.mapVersion, result.value.version);
      assert.ok(featureOp.mapVersion > before.version);
      assert.equal(featureOp.contentFingerprint, result.value.contentFingerprint);
      const layerBroadcast = waitForMessage(socket, (message) => message.action === 'layer.updated');
      const layerResult = await request('PATCH', `/api/layers/${layerA}`, owner.sessionId, { name: 'Layer metadata check' });
      assert.equal(layerResult.status, 200);
      const layerOp = await layerBroadcast;
      assert.equal(layerOp.entity.id, layerA);
      assert.equal(layerOp.version, layerResult.value.layers.find((layer) => layer.id === layerA).version);
      assert.equal(layerOp.mapVersion, layerResult.value.version);
      assert.equal(layerOp.contentFingerprint, layerResult.value.contentFingerprint);
    });

    await t.test('checkpoints undo and redo geometry, style, cross-layer moves, names and bulk creation together', async () => {
      const before = await checkpoint();
      let current = (await request('PATCH', endpoint, owner.sessionId, { name: 'Renamed map', expectedFingerprint: before.fingerprint })).value;
      current = (await request('PATCH', `/api/features/${featureA}`, owner.sessionId, {
        name: 'Changed point', geometry: { type: 'Point', coordinates: [120, 30] }, style: { color: '#00ff00' }, expectedFingerprint: current.contentFingerprint,
      })).value;
      current = (await request('POST', `/api/features/${featureA}/move`, owner.sessionId, { layerId: layerA, index: 0, expectedFingerprint: current.contentFingerprint })).value;
      current = (await request('POST', `/api/layers/${layerA}/features/bulk`, owner.sessionId, {
        features: [{ name: 'Imported', geometry: point }], expectedFingerprint: current.contentFingerprint,
      })).value;
      const after = await checkpoint({ expectedFingerprint: current.contentFingerprint });
      const undo = await restore(before.token, after.fingerprint);
      assert.equal(undo.status, 200);
      assert.equal(undo.value.fingerprint, before.fingerprint);
      assert.equal(undo.value.map.name, 'Editable map');
      assert.equal(feature(undo.value.map, featureA).layer_id, layerB);
      assert.equal(feature(undo.value.map, featureA).name, 'First point');
      assert.deepEqual(feature(undo.value.map, featureA).geometry, point);
      const redo = await restore(after.token, undo.value.fingerprint);
      assert.equal(redo.status, 200);
      assert.equal(redo.value.fingerprint, after.fingerprint);
      assert.equal(redo.value.map.name, 'Renamed map');
      assert.equal(feature(redo.value.map, featureA).layer_id, layerA);
      assert.ok(redo.value.map.layers.flatMap((layer) => layer.features).some((item) => item.name === 'Imported'));
    });

    await t.test('deleted layers and features restore their IDs, while guarded delete returns the resulting fingerprint', async () => {
      const before = await checkpoint();
      const layerBroadcast = waitForMessage(socket, (message) => message.action === 'layer.deleted');
      const deleted = await request('DELETE', `/api/layers/${layerB}`, owner.sessionId, { expectedFingerprint: before.fingerprint });
      assert.equal(deleted.status, 200);
      assert.ok(deleted.value.contentFingerprint);
      assert.equal(deleted.value.layers.some((layer) => layer.id === layerB), false);
      const layerOp = await layerBroadcast;
      assert.equal(layerOp.entityId, layerB);
      assert.equal(layerOp.mapVersion, deleted.value.version);
      assert.equal(layerOp.contentFingerprint, deleted.value.contentFingerprint);
      const restored = await restore(before.token, deleted.value.contentFingerprint);
      assert.equal(restored.status, 200);
      assert.ok(feature(restored.value.map, featureC));
      const featureCheckpoint = await checkpoint();
      const featureBroadcast = waitForMessage(socket, (message) => message.action === 'feature.deleted');
      const deletedFeature = await request('DELETE', `/api/features/${featureB}`, owner.sessionId, { expectedFingerprint: featureCheckpoint.fingerprint });
      assert.equal(deletedFeature.status, 200);
      const featureOp = await featureBroadcast;
      assert.equal(featureOp.entityId, featureB);
      assert.equal(featureOp.mapVersion, deletedFeature.value.version);
      assert.equal(featureOp.contentFingerprint, deletedFeature.value.contentFingerprint);
      assert.equal((await restore(featureCheckpoint.token, deletedFeature.value.contentFingerprint)).status, 200);
    });

    await t.test('fingerprints protect all three concurrency windows and never overwrite collaborator changes', async () => {
      const before = await checkpoint();
      const collaboration = await request('PATCH', `/api/features/${featureB}`, editor.sessionId, { name: 'Collaborator edit' });
      const guardedMutation = await request('PATCH', `/api/features/${featureA}`, owner.sessionId, { name: 'Should not save', expectedFingerprint: before.fingerprint });
      assert.equal(guardedMutation.status, 409);
      assert.equal(guardedMutation.value.latest.contentFingerprint, collaboration.value.contentFingerprint);
      assert.equal((await request('PATCH', `/api/features/${featureA}/`, owner.sessionId, { name: 'Trailing slash cannot bypass', expectedFingerprint: before.fingerprint })).status, 409);
      const encodedId = [...String(featureA)].map((character) => `%${character.charCodeAt(0).toString(16)}`).join('');
      assert.equal((await request('PATCH', `/api/features/${encodedId}`, owner.sessionId, { name: 'Encoded ID cannot bypass', expectedFingerprint: before.fingerprint })).status, 409);
      assert.equal((await restore(before.token, before.fingerprint)).status, 409);
      assert.equal(feature(await get(), featureB).name, 'Collaborator edit');
      const postRace = await request('POST', `${endpoint}/checkpoints`, owner.sessionId, { expectedFingerprint: before.fingerprint });
      assert.equal(postRace.status, 409);
      assert.equal((await restore(before.token, 'invalid')).status, 400);
      const current = await get();
      assert.equal((await request('POST', `${endpoint}/reorder`, owner.sessionId, { layerIds: [layerA, layerB], expectedFingerprint: before.fingerprint })).status, 409);
      assert.equal((await get()).contentFingerprint, current.contentFingerprint);
    });

    await t.test('checkpoint ownership and editor permissions cannot be bypassed with forged tokens or snapshots', async () => {
      const current = await get();
      const cp = await checkpoint();
      assert.equal((await restore(cp.token, current.contentFingerprint, editor.sessionId)).status, 404);
      assert.equal((await restore(cp.token, current.contentFingerprint, owner.sessionId, `/api/maps/${otherMap.id}`)).status, 404);
      assert.equal((await request('POST', `${endpoint}/restore-checkpoint`, owner.sessionId, { token: 'forged', expectedFingerprint: current.contentFingerprint, snapshot: otherMap })).status, 404);
      for (const [method, route, body] of [
        ['POST', `${endpoint}/checkpoints`, {}],
        ['POST', `${endpoint}/reorder`, { layerIds: [layerA, layerB] }],
        ['POST', `${endpoint}/features/reorder`, { layerId: layerA, featureIds: [] }],
        ['POST', `/api/features/${featureA}/move`, { layerId: layerB, index: 0 }],
        ['PATCH', `/api/layers/${layerB}/style`, { style: { color: '#ffffff' }, applyToFeatures: true }],
        ['POST', `${endpoint}/restore-checkpoint`, { token: cp.token, expectedFingerprint: current.contentFingerprint }],
      ]) {
        assert.equal((await request(method, route, viewer.sessionId, body)).status, 403);
        assert.equal((await request(method, route, null, body)).status, 401);
      }
      assert.equal((await get()).contentFingerprint, current.contentFingerprint);
    });

    await t.test('a historical ID now owned by another map cannot be moved or overwritten by restoration', async () => {
      directDb = new DatabaseSync(path.join(directory, 'content.sqlite'));
      const isolated = await makeMap('Collision test map');
      const isolatedEndpoint = `/api/maps/${isolated.id}`;
      const featureId = await addFeature(isolated.layers[0].id, 'Historical feature', point);
      const cp = (await request('POST', `${isolatedEndpoint}/checkpoints`, owner.sessionId, {})).value;
      const deleted = await request('DELETE', `/api/features/${featureId}`, owner.sessionId, { expectedFingerprint: cp.fingerprint });
      const created = new Date().toISOString();
      directDb.prepare(`INSERT INTO features (id, layer_id, type, name, geometry_json, created_at, updated_at)
        VALUES (?, ?, 'Point', 'Other map feature', ?, ?, ?)`)
        .run(featureId, otherMap.layers[0].id, JSON.stringify(point), created, created);
      assert.equal((await restore(cp.token, deleted.value.contentFingerprint, owner.sessionId, isolatedEndpoint)).status, 409);
      assert.equal((await request('GET', isolatedEndpoint, owner.sessionId)).value.contentFingerprint, deleted.value.contentFingerprint);
      assert.equal(directDb.prepare('SELECT layer_id FROM features WHERE id = ?').get(featureId).layer_id, otherMap.layers[0].id);
      directDb.prepare('DELETE FROM features WHERE id = ?').run(featureId);
      assert.equal((await restore(cp.token, deleted.value.contentFingerprint, owner.sessionId, isolatedEndpoint)).status, 200);

      const withExtraLayer = (await request('POST', `${isolatedEndpoint}/layers`, owner.sessionId, { name: 'Historical layer' })).value;
      const layerId = withExtraLayer.layers[1].id;
      const layerCp = (await request('POST', `${isolatedEndpoint}/checkpoints`, owner.sessionId, {})).value;
      const removedLayer = await request('DELETE', `/api/layers/${layerId}`, owner.sessionId, { expectedFingerprint: layerCp.fingerprint });
      directDb.prepare('INSERT INTO layers (id, map_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(layerId, otherMap.id, 'Other map layer', created, created);
      assert.equal((await restore(layerCp.token, removedLayer.value.contentFingerprint, owner.sessionId, isolatedEndpoint)).status, 409);
      assert.equal((await request('GET', isolatedEndpoint, owner.sessionId)).value.contentFingerprint, removedLayer.value.contentFingerprint);
      assert.equal(directDb.prepare('SELECT map_id FROM layers WHERE id = ?').get(layerId).map_id, otherMap.id);
      directDb.prepare('DELETE FROM layers WHERE id = ?').run(layerId);
      assert.equal((await restore(layerCp.token, removedLayer.value.contentFingerprint, owner.sessionId, isolatedEndpoint)).status, 200);
    });

    await t.test('media stays attached during ordinary undo and irreversible media deletion blocks restoration atomically', async () => {
      const form = new FormData();
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK42CYII=', 'base64');
      form.append('files', new Blob([png], { type: 'image/png' }), 'photo.png');
      const uploaded = await request('POST', `/api/features/${featureA}/attachments`, owner.sessionId, form);
      assert.equal(uploaded.status, 201);
      const attachment = feature(uploaded.value, featureA).attachments[0];
      const before = await checkpoint();
      const edited = await request('PATCH', `/api/features/${featureA}`, owner.sessionId, { name: 'With photo', expectedFingerprint: before.fingerprint });
      const undo = await restore(before.token, edited.value.contentFingerprint);
      assert.equal(undo.status, 200);
      assert.equal(feature(undo.value.map, featureA).attachments[0].id, attachment.id);
      assert.equal((await fetch(`${server.url}${attachment.url}`)).status, 200);
      const deleted = await request('DELETE', `/api/features/${featureA}`, owner.sessionId, { expectedFingerprint: undo.value.fingerprint });
      assert.equal(deleted.status, 200);
      const blocked = await restore(before.token, deleted.value.contentFingerprint);
      assert.equal(blocked.status, 409);
      assert.equal(blocked.value.code, 'HISTORY_MEDIA_CHANGED');
      assert.equal((await get()).contentFingerprint, deleted.value.contentFingerprint);
      assert.equal(feature(await get(), featureA), undefined);
    });

    await t.test('expired checkpoints and checkpoint retention are bounded; trash blocks new and restored history', async () => {
      const expired = await checkpoint();
      directDb.prepare('UPDATE content_checkpoints SET expires_at = ? WHERE token = ?').run('2000-01-01T00:00:00.000Z', expired.token);
      assert.equal((await restore(expired.token, (await get()).contentFingerprint)).status, 404);
      const oldest = await checkpoint();
      for (let i = 0; i < 50; i += 1) await checkpoint();
      assert.equal(Number(directDb.prepare('SELECT COUNT(*) AS count FROM content_checkpoints WHERE map_id = ? AND user_id = ?').get(map.id, owner.user.id).count), 50);
      assert.equal((await restore(oldest.token, (await get()).contentFingerprint)).status, 404);
      const current = await get();
      const cp = await checkpoint();
      assert.equal((await request('POST', `${endpoint}/trash`, owner.sessionId)).status, 200);
      assert.equal((await request('POST', `${endpoint}/checkpoints`, owner.sessionId)).status, 404);
      assert.equal((await restore(cp.token, current.contentFingerprint)).status, 404);
      assert.equal((await request('POST', `${endpoint}/reorder`, owner.sessionId, { layerIds: [layerA, layerB] })).status, 404);
      assert.equal((await request('PATCH', `/api/layers/${layerB}/style`, owner.sessionId, { style: { color: '#ffffff' }, applyToFeatures: true })).status, 404);
    });
  } finally {
    directDb?.close();
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate();
    if (server?.child && server.child.exitCode === null) {
      const closed = once(server.child, 'exit');
      server.child.kill();
      await closed;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy features receive stable per-layer positions during schema migration', { timeout: 15_000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-position-migration-'));
  let server;
  const legacyDb = new DatabaseSync(path.join(directory, 'content.sqlite'));
  legacyDb.exec(`
    CREATE TABLE features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      geometry_json TEXT NOT NULL,
      style_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const insert = legacyDb.prepare(`INSERT INTO features (id, layer_id, type, name, geometry_json, created_at, updated_at)
    VALUES (?, ?, 'Point', 'Legacy feature', '{"type":"Point","coordinates":[121,31]}', '2026-01-01', '2026-01-01')`);
  insert.run(7, 1);
  insert.run(3, 1);
  insert.run(9, 2);
  insert.run(5, 2);
  legacyDb.close();
  try {
    server = await startServer(directory);
    const migrated = new DatabaseSync(path.join(directory, 'content.sqlite'));
    try {
      assert.deepEqual(migrated.prepare('SELECT id, position FROM features WHERE id IN (3, 5, 7, 9) ORDER BY layer_id, position').all()
        .map((row) => [row.id, row.position]), [[3, 0], [7, 1], [5, 0], [9, 1]]);
      assert.ok(migrated.prepare('PRAGMA table_info(features)').all().some((column) => column.name === 'position'));
    } finally {
      migrated.close();
    }
  } finally {
    if (server?.child && server.child.exitCode === null) {
      const closed = once(server.child, 'exit');
      server.child.kill();
      await closed;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
