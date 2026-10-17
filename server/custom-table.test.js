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

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startServer(directory) {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(directory, 'custom-table.sqlite'),
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
  return { child, url: `http://127.0.0.1:${port}` };
}

async function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  const closed = once(server.child, 'exit');
  server.child.kill();
  await closed;
}

test('custom table schemas and cells persist, merge, authorize, restore and move without data loss', { timeout: 35_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-custom-table-'));
  let server;
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
    const register = async (name) => (await request('POST', '/api/auth/register', null, {
      name,
      email: `${name}@example.com`,
      password: 'secret1',
    })).value;
    const owner = await register('table-owner');
    const viewer = await register('table-viewer');
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Table project' })).value;
    assert.equal((await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
      email: viewer.user.email, role: 'viewer',
    })).status, 201);
    const map = (await request('POST', '/api/maps', owner.sessionId, { name: 'Table map', projectId: project.id })).value;
    const otherMap = (await request('POST', '/api/maps', owner.sessionId, { name: 'Other map', projectId: project.id })).value;
    const mapEndpoint = `/api/maps/${map.id}`;
    const getMap = async (session = owner.sessionId) => (await request('GET', mapEndpoint, session)).value;
    const firstLayerId = map.layers[0].id;
    const secondLayerMap = (await request('POST', `${mapEndpoint}/layers`, owner.sessionId, { name: 'Destination' })).value;
    const secondLayerId = secondLayerMap.createdLayerId;
    const columns = [
      { id: 'col_owner', name: '负责人' },
      { id: 'col_note', name: '备注' },
    ];

    await t.test('schema validation is normalized and atomic', async () => {
      const updated = await request('PATCH', `/api/layers/${firstLayerId}`, owner.sessionId, { columns });
      assert.equal(updated.status, 200);
      assert.deepEqual(updated.value.layers.find((layer) => layer.id === firstLayerId).columns, columns);
      const fingerprint = updated.value.contentFingerprint;
      for (const invalid of [
        [{ id: 'bad', name: '自定义' }],
        [{ id: 'col_a', name: '名称' }],
        [{ id: 'col_a', name: 'Owner' }, { id: 'col_b', name: ' owner ' }],
        [{ id: 'col_a', name: '有效' }, { id: 'col_a', name: '重复 ID' }],
        Array.from({ length: 51 }, (_, index) => ({ id: `col_${index}`, name: `列 ${index}` })),
      ]) {
        assert.equal((await request('PATCH', `/api/layers/${firstLayerId}`, owner.sessionId, { columns: invalid })).status, 400);
        assert.equal((await getMap()).contentFingerprint, fingerprint);
      }
    });

    let featureId;
    await t.test('creation and sparse updates preserve unrelated cells and ordinary feature fields', async () => {
      const created = await request('POST', `/api/layers/${firstLayerId}/features`, owner.sessionId, {
        name: 'Custom row',
        geometry: { type: 'Point', coordinates: [121.47, 31.23] },
        style: { color: '#123456' },
        properties: { col_owner: '王老师', col_note: '第一版' },
      });
      assert.equal(created.status, 201);
      featureId = created.value.createdFeatureId;
      let feature = created.value.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId);
      assert.deepEqual(feature.properties, { col_owner: '王老师', col_note: '第一版' });
      const patched = await request('PATCH', `/api/features/${featureId}`, owner.sessionId, { properties: { col_note: '第二版' } });
      assert.equal(patched.status, 200);
      feature = patched.value.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId);
      assert.deepEqual(feature.properties, { col_owner: '王老师', col_note: '第二版' });
      const renamed = await request('PATCH', `/api/features/${featureId}`, owner.sessionId, { description: '说明更新' });
      feature = renamed.value.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId);
      assert.deepEqual(feature.properties, { col_owner: '王老师', col_note: '第二版' });
      assert.deepEqual(feature.style, { color: '#123456' });
      assert.deepEqual(feature.geometry, { type: 'Point', coordinates: [121.47, 31.23] });
    });

    await t.test('bad cell data, viewer edits and cross-map moves are rejected atomically', async () => {
      const before = await getMap();
      for (const properties of [
        { col_missing: 'x' },
        { col_owner: 42 },
        { col_owner: 'x'.repeat(10_001) },
        [],
      ]) {
        assert.equal((await request('PATCH', `/api/features/${featureId}`, owner.sessionId, { properties })).status, 400);
        assert.equal((await getMap()).contentFingerprint, before.contentFingerprint);
      }
      assert.equal((await request('PATCH', `/api/layers/${firstLayerId}`, viewer.sessionId, { columns: [] })).status, 403);
      assert.equal((await request('PATCH', `/api/features/${featureId}`, viewer.sessionId, { properties: { col_note: 'forbidden' } })).status, 403);
      assert.equal((await request('POST', `/api/features/${featureId}/move`, owner.sessionId, {
        layerId: otherMap.layers[0].id, index: 0,
      })).status, 400);
      assert.equal((await getMap()).contentFingerprint, before.contentFingerprint);
    });

    await t.test('checkpoints undo and redo both schema and cell values', async () => {
      const before = (await request('POST', `${mapEndpoint}/checkpoints`, owner.sessionId, {})).value;
      let changed = (await request('PATCH', `/api/layers/${firstLayerId}`, owner.sessionId, {
        columns: [...columns, { id: 'col_status', name: '状态' }], expectedFingerprint: before.fingerprint,
      })).value;
      changed = (await request('PATCH', `/api/features/${featureId}`, owner.sessionId, {
        properties: { col_status: '已完成' }, expectedFingerprint: changed.contentFingerprint,
      })).value;
      const after = (await request('POST', `${mapEndpoint}/checkpoints`, owner.sessionId, {
        expectedFingerprint: changed.contentFingerprint,
      })).value;
      const undone = await request('POST', `${mapEndpoint}/restore-checkpoint`, owner.sessionId, {
        token: before.token, expectedFingerprint: after.fingerprint,
      });
      assert.equal(undone.status, 200);
      assert.deepEqual(undone.value.map.layers.find((layer) => layer.id === firstLayerId).columns, columns);
      assert.equal(undone.value.map.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId).properties.col_status, undefined);
      const redone = await request('POST', `${mapEndpoint}/restore-checkpoint`, owner.sessionId, {
        token: after.token, expectedFingerprint: undone.value.fingerprint,
      });
      assert.equal(redone.status, 200);
      assert.equal(redone.value.map.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId).properties.col_status, '已完成');
    });

    await t.test('moving maps same-name columns and copies missing definitions without losing cells', async () => {
      const destinationColumns = [
        { id: 'col_destination_owner', name: '负责人' },
        { id: 'col_status', name: '目标状态' },
      ];
      assert.equal((await request('PATCH', `/api/layers/${secondLayerId}`, owner.sessionId, { columns: destinationColumns })).status, 200);
      const current = await getMap();
      const sourceFeature = current.layers.flatMap((layer) => layer.features).find((item) => item.id === featureId);
      const moved = await request('POST', `/api/features/${featureId}/move`, owner.sessionId, {
        layerId: secondLayerId,
        index: 0,
        expectedVersion: sourceFeature.version,
      });
      assert.equal(moved.status, 200);
      const destination = moved.value.layers.find((layer) => layer.id === secondLayerId);
      const feature = destination.features.find((item) => item.id === featureId);
      assert.equal(feature.properties.col_destination_owner, '王老师');
      assert.equal(feature.properties.col_note, '第二版');
      assert.ok(destination.columns.some((column) => column.id === 'col_note' && column.name === '备注'));
      assert.ok(destination.columns.some((column) => column.id === 'col_status' && column.name === '目标状态'));
      const copiedStatus = destination.columns.find((column) => column.name === '状态' && column.id !== 'col_status');
      assert.ok(copiedStatus);
      assert.equal(feature.properties[copiedStatus.id], '已完成');

      const patchMoveCreated = await request('POST', `/api/layers/${firstLayerId}/features`, owner.sessionId, {
        name: 'Patch moved row',
        geometry: { type: 'Point', coordinates: [121.48, 31.24] },
        properties: { col_owner: '李老师', col_note: '移动前' },
      });
      const patchMoveId = patchMoveCreated.value.createdFeatureId;
      const patchMoved = await request('PATCH', `/api/features/${patchMoveId}`, owner.sessionId, {
        layerId: secondLayerId,
        properties: { col_note: '随移动更新' },
      });
      assert.equal(patchMoved.status, 200);
      const patchMovedFeature = patchMoved.value.layers.find((layer) => layer.id === secondLayerId)
        .features.find((item) => item.id === patchMoveId);
      assert.equal(patchMovedFeature.properties.col_destination_owner, '李老师');
      assert.equal(patchMovedFeature.properties.col_note, '随移动更新');
    });

    await stopServer(server);
    server = await startServer(directory);
    const persisted = await request('GET', mapEndpoint, owner.sessionId);
    assert.equal(persisted.status, 200);
    const persistedDestination = persisted.value.layers.find((layer) => layer.id === secondLayerId);
    assert.ok(persistedDestination.columns.some((column) => column.name === '备注'));
    assert.equal(persistedDestination.features.find((item) => item.id === featureId).properties.col_note, '第二版');
  } finally {
    await stopServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy databases migrate custom table JSON columns with empty defaults', { timeout: 15_000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-custom-table-migration-'));
  const databasePath = path.join(directory, 'custom-table.sqlite');
  const legacy = new DatabaseSync(databasePath);
  const created = '2026-01-01T00:00:00.000Z';
  legacy.exec(`
    CREATE TABLE maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT 'Owner',
      visibility TEXT NOT NULL DEFAULT 'private', base_map TEXT NOT NULL DEFAULT 'standard', center_lat REAL NOT NULL DEFAULT 31,
      center_lng REAL NOT NULL DEFAULT 121, zoom INTEGER NOT NULL DEFAULT 12, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE layers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE, name TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0, style_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE features (
      id INTEGER PRIMARY KEY AUTOINCREMENT, layer_id INTEGER NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
      type TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', geometry_json TEXT NOT NULL,
      style_json TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  legacy.prepare('INSERT INTO maps (id, name, created_at, updated_at) VALUES (1, ?, ?, ?)').run('Legacy table', created, created);
  legacy.prepare('INSERT INTO layers (id, map_id, name, created_at, updated_at) VALUES (1, 1, ?, ?, ?)').run('Legacy layer', created, created);
  legacy.prepare(`INSERT INTO features (id, layer_id, type, name, geometry_json, created_at, updated_at)
    VALUES (1, 1, 'Point', 'Legacy row', '{"type":"Point","coordinates":[121,31]}', ?, ?)`).run(created, created);
  legacy.close();
  let server;
  try {
    server = await startServer(directory);
    const migrated = new DatabaseSync(databasePath);
    try {
      assert.equal(migrated.prepare('SELECT columns_json FROM layers WHERE id = 1').get().columns_json, '[]');
      assert.equal(migrated.prepare('SELECT properties_json FROM features WHERE id = 1').get().properties_json, '{}');
    } finally {
      migrated.close();
    }
  } finally {
    await stopServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});
