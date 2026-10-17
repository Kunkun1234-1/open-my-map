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
      DB_PATH: path.join(directory, 'map-preview.sqlite'),
      UPLOAD_DIR: path.join(directory, 'uploads'),
      UPLOAD_TEMP_DIR: path.join(directory, 'upload-temp'),
      COVER_DIR: path.join(directory, 'covers'),
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

test('protected map previews expose current lightweight geometry to permitted members', { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-map-preview-test-'));
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
      return { status: response.status, value, headers: response.headers };
    };
    const register = async (name) => {
      const result = await request('POST', '/api/auth/register', null, {
        name, email: `${name}@example.com`, password: 'secret1',
      });
      assert.equal(result.status, 201);
      return result.value;
    };

    const owner = await register('preview-owner');
    const editor = await register('preview-editor');
    const viewer = await register('preview-viewer');
    const outsider = await register('preview-outsider');
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Preview project' })).value;
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      assert.equal((await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
        email: account.user.email, role,
      })).status, 201);
    }
    const created = await request('POST', '/api/maps', owner.sessionId, {
      projectId: project.id, name: 'Preview map',
    });
    assert.equal(created.status, 201);
    const mapId = created.value.id;
    const firstLayerId = created.value.layers[0].id;
    const endpoint = `/api/maps/${mapId}/preview`;

    await t.test('authentication and active-map membership are enforced', async () => {
      assert.equal((await request('GET', endpoint, null)).status, 401);
      assert.equal((await request('GET', endpoint, outsider.sessionId)).status, 403);
      for (const account of [owner, editor, viewer]) {
        const result = await request('GET', endpoint, account.sessionId);
        assert.equal(result.status, 200);
        assert.equal(result.headers.get('cache-control'), 'private, no-store');
      }
    });

    await t.test('preview reflects basemap, viewport, ordered geometry, styles and hidden layers', async () => {
      assert.equal((await request('PATCH', `/api/maps/${mapId}`, owner.sessionId, {
        base_map: 'satellite', center_lat: 30.2741, center_lng: 120.1551, zoom: 14,
      })).status, 200);
      const firstFeature = await request('POST', `/api/layers/${firstLayerId}/features`, owner.sessionId, {
        name: 'West Lake marker',
        description: 'Must not be included in preview payload',
        geometry: { type: 'Point', coordinates: [120.1551, 30.2741] },
        style: { color: '#c2410c', icon: 'pin' },
      });
      assert.equal(firstFeature.status, 201);
      const secondLayer = await request('POST', `/api/maps/${mapId}/layers`, owner.sessionId, {
        name: 'Hidden route', style: { color: '#2563eb', weight: 4 },
      });
      assert.equal(secondLayer.status, 201);
      const secondLayerId = secondLayer.value.createdLayerId;
      assert.equal((await request('PATCH', `/api/layers/${secondLayerId}`, owner.sessionId, {
        visible: false,
      })).status, 200);
      const secondFeature = await request('POST', `/api/layers/${secondLayerId}/features`, owner.sessionId, {
        name: 'Hidden line',
        geometry: { type: 'LineString', coordinates: [[120.1, 30.2], [120.2, 30.3]] },
        style: { color: '#1d4ed8', weight: 5 },
      });
      assert.equal(secondFeature.status, 201);
      assert.equal((await request('POST', `/api/maps/${mapId}/reorder`, owner.sessionId, {
        layerIds: [secondLayerId, firstLayerId],
      })).status, 200);

      const result = await request('GET', endpoint, viewer.sessionId);
      assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.value), ['id', 'base_map', 'center_lat', 'center_lng', 'zoom', 'layers']);
      assert.deepEqual(result.value, {
        id: mapId,
        base_map: 'satellite',
        center_lat: 30.2741,
        center_lng: 120.1551,
        zoom: 14,
        layers: [
          {
            id: secondLayerId,
            visible: false,
            style: { color: '#2563eb', weight: 4 },
            features: [{
              id: secondFeature.value.createdFeatureId,
              type: 'LineString',
              name: 'Hidden line',
              geometry: { type: 'LineString', coordinates: [[120.1, 30.2], [120.2, 30.3]] },
              style: { color: '#1d4ed8', weight: 5 },
            }],
          },
          {
            id: firstLayerId,
            visible: true,
            style: { color: '#1a73e8' },
            features: [{
              id: firstFeature.value.createdFeatureId,
              type: 'Point',
              name: 'West Lake marker',
              geometry: { type: 'Point', coordinates: [120.1551, 30.2741] },
              style: { color: '#c2410c', icon: 'pin' },
            }],
          },
        ],
      });
      assert.equal(JSON.stringify(result.value).includes('description'), false);
      assert.equal(JSON.stringify(result.value).includes('attachments'), false);
    });

    await t.test('trashed previews require management permission and permanent deletion returns 404', async () => {
      assert.equal((await request('POST', `/api/maps/${mapId}/trash`, owner.sessionId)).status, 200);
      assert.equal((await request('GET', endpoint, editor.sessionId)).status, 403);
      assert.equal((await request('GET', endpoint, viewer.sessionId)).status, 403);
      const ownerPreview = await request('GET', endpoint, owner.sessionId);
      assert.equal(ownerPreview.status, 200);
      assert.equal(ownerPreview.value.layers[0].visible, false);
      assert.equal((await request('DELETE', `/api/maps/${mapId}`, owner.sessionId)).status, 204);
      assert.equal((await request('GET', endpoint, owner.sessionId)).status, 404);
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
