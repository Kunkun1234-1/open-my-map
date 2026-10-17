import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function availablePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(directory) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(directory, 'map-metadata.sqlite'),
      UPLOAD_DIR: path.join(directory, 'uploads'),
      UPLOAD_TEMP_DIR: path.join(directory, 'upload-temp'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10_000);
    const done = (error) => {
      clearTimeout(timeout);
      child.off('exit', earlyExit);
      child.off('error', done);
      if (error) reject(error); else resolve();
    };
    const earlyExit = (code) => done(new Error(`Server exited (${code}): ${output}`));
    child.once('exit', earlyExit);
    child.once('error', done);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('Open My Map server listening')) done();
    });
  }).catch((error) => {
    child.kill();
    throw error;
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

test('map metadata updates persist without weakening editor permissions or map versions', { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-map-metadata-test-'));
  let server;
  try {
    server = await startServer(directory);
    const request = async (method, endpoint, sessionId, body) => {
      const headers = {};
      if (sessionId) headers.authorization = `Bearer ${sessionId}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${endpoint}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = response.status === 204 ? null : await response.json();
      return { status: response.status, value };
    };
    const register = async (name) => {
      const result = await request('POST', '/api/auth/register', null, {
        name, email: `${name}@example.com`, password: 'secret1',
      });
      assert.equal(result.status, 201);
      return result.value;
    };

    const owner = await register('metadata-owner');
    const editor = await register('metadata-editor');
    const viewer = await register('metadata-viewer');
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Map metadata project' })).value;
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      assert.equal((await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
        email: account.user.email, role,
      })).status, 201);
    }
    const created = await request('POST', '/api/maps', owner.sessionId, {
      projectId: project.id, name: 'Original map', description: 'Original description',
    });
    assert.equal(created.status, 201);
    const mapId = created.value.id;
    const endpoint = `/api/maps/${mapId}`;

    await t.test('owner and editor metadata changes persist, increment versions and preserve unrelated fields', async () => {
      const before = created.value;
      const ownerUpdate = await request('PATCH', endpoint, owner.sessionId, {
        name: '  Renamed from table  ',
        description: 'Updated description',
        expectedVersion: before.version,
      });
      assert.equal(ownerUpdate.status, 200);
      assert.equal(ownerUpdate.value.name, 'Renamed from table');
      assert.equal(ownerUpdate.value.description, 'Updated description');
      assert.equal(ownerUpdate.value.version, before.version + 1);
      for (const key of ['project_id', 'owner', 'visibility', 'base_map', 'center_lat', 'center_lng', 'zoom']) {
        assert.deepEqual(ownerUpdate.value[key], before[key], key);
      }
      assert.deepEqual(ownerUpdate.value.layers, before.layers);
      assert.notEqual(ownerUpdate.value.contentFingerprint, before.contentFingerprint);

      const editorUpdate = await request('PATCH', endpoint, editor.sessionId, {
        description: 'Editor description',
        project_id: 999999,
        expectedVersion: ownerUpdate.value.version,
      });
      assert.equal(editorUpdate.status, 200);
      assert.equal(editorUpdate.value.name, 'Renamed from table');
      assert.equal(editorUpdate.value.description, 'Editor description');
      assert.equal(editorUpdate.value.project_id, project.id);
      assert.equal(editorUpdate.value.version, ownerUpdate.value.version + 1);

      const persisted = await request('GET', endpoint, viewer.sessionId);
      assert.equal(persisted.status, 200);
      assert.equal(persisted.value.name, 'Renamed from table');
      assert.equal(persisted.value.description, 'Editor description');
      assert.equal(persisted.value.version, editorUpdate.value.version);
    });

    await t.test('viewer and unauthenticated metadata writes are rejected', async () => {
      assert.equal((await request('PATCH', endpoint, viewer.sessionId, { name: 'Viewer write' })).status, 403);
      assert.equal((await request('PATCH', endpoint, null, { name: 'Anonymous write' })).status, 401);
    });

    await t.test('blank and oversized metadata are rejected without changing the map', async () => {
      const before = (await request('GET', endpoint, owner.sessionId)).value;
      for (const body of [
        { name: '   ' },
        { name: 'x'.repeat(121) },
        { description: 'x'.repeat(2001) },
      ]) {
        assert.equal((await request('PATCH', endpoint, owner.sessionId, body)).status, 400);
      }
      const after = (await request('GET', endpoint, owner.sessionId)).value;
      assert.equal(after.name, before.name);
      assert.equal(after.description, before.description);
      assert.equal(after.version, before.version);
      assert.equal(after.updated_at, before.updated_at);
    });

    await t.test('stale versions conflict and trashed maps cannot be edited', async () => {
      const current = (await request('GET', endpoint, owner.sessionId)).value;
      const stale = await request('PATCH', endpoint, editor.sessionId, {
        name: 'Stale edit', expectedVersion: current.version - 1,
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.value.latest.name, current.name);

      assert.equal((await request('POST', `${endpoint}/trash`, owner.sessionId)).status, 200);
      assert.equal((await request('PATCH', endpoint, owner.sessionId, { name: 'Edit in trash' })).status, 404);
      assert.equal((await request('PATCH', endpoint, editor.sessionId, { description: 'Edit in trash' })).status, 404);
      const trashed = (await request('GET', '/api/maps/trash', owner.sessionId)).value.find((map) => map.id === mapId);
      assert.equal(trashed.name, current.name);
      assert.equal(trashed.description, current.description);
    });
  } finally {
    if (server?.child && server.child.exitCode === null) {
      const exited = once(server.child, 'exit');
      server.child.kill();
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
