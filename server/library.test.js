import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer(tempDir) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(tempDir, 'library.sqlite'),
      UPLOAD_DIR: path.join(tempDir, 'uploads'),
      UPLOAD_TEMP_DIR: path.join(tempDir, 'upload-temp'),
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
  return { child, url: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws` };
}

function wsInbox(socket) {
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(String(raw))));
  return async (predicate) => {
    const existing = messages.findIndex(predicate);
    if (existing !== -1) return messages.splice(existing, 1)[0];
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', listener);
        reject(new Error('Expected realtime message did not arrive'));
      }, 3000);
      const listener = (raw) => {
        const message = JSON.parse(String(raw));
        if (!predicate(message)) return;
        clearTimeout(timeout);
        socket.off('message', listener);
        const index = messages.findIndex(predicate);
        resolve(index === -1 ? message : messages.splice(index, 1)[0]);
      };
      socket.on('message', listener);
    });
  };
}

test('favorites and trash preserve data while enforcing project permissions', { timeout: 30_000 }, async (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'omm-library-test-'));
  let server;
  let socket;
  try {
    server = await startServer(tempDir);
    const request = async (method, endpoint, sessionId, body) => {
      const headers = {};
      if (sessionId) headers.authorization = `Bearer ${sessionId}`;
      if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${endpoint}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
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
    const owner = await register('owner');
    const editor = await register('editor');
    const viewer = await register('viewer');
    const outsider = await register('outsider');
    const admin = (await request('POST', '/api/auth/login', null, {
      email: 'admin@openmymap.local', password: 'admin123',
    })).value;
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Library test' })).value;
    for (const member of [{ user: editor, role: 'editor' }, { user: viewer, role: 'viewer' }]) {
      const invite = await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
        email: member.user.user.email, role: member.role,
      });
      assert.equal(invite.status, 201);
    }
    await t.test('only owners, editors and admins may create maps in active projects', async () => {
      assert.equal((await request('POST', '/api/maps', viewer.sessionId, { projectId: project.id, name: 'Viewer denied' })).status, 403);
      assert.equal((await request('POST', '/api/maps', viewer.sessionId, { name: 'Default viewer denied' })).status, 400);
      assert.equal((await request('POST', '/api/maps', outsider.sessionId, { projectId: project.id, name: 'Outsider denied' })).status, 403);
      assert.equal((await request('POST', '/api/maps', admin.sessionId, { projectId: 999999, name: 'Missing project' })).status, 404);
      const editableMap = await request('POST', '/api/maps', editor.sessionId, { projectId: project.id, name: 'Editor allowed' });
      assert.equal(editableMap.status, 201);
      assert.equal((await request('DELETE', `/api/maps/${editableMap.value.id}`, owner.sessionId)).status, 204);
      const archivedProject = (await request('POST', '/api/projects', owner.sessionId, { name: 'Archived project' })).value;
      assert.equal((await request('PATCH', `/api/admin/projects/${archivedProject.id}`, admin.sessionId, { status: 'archived' })).status, 200);
      assert.equal((await request('POST', '/api/maps', owner.sessionId, { projectId: archivedProject.id, name: 'Archived denied' })).status, 400);
      assert.equal((await request('POST', '/api/maps', admin.sessionId, { projectId: archivedProject.id, name: 'Archived admin denied' })).status, 400);
    });
    const map = (await request('POST', '/api/maps', owner.sessionId, { projectId: project.id, name: 'Restore me' })).value;
    const mapEndpoint = `/api/maps/${map.id}`;
    const layer = map.layers[0];
    const withFeature = (await request('POST', `/api/layers/${layer.id}/features`, owner.sessionId, {
      name: 'A place', geometry: { type: 'Point', coordinates: [121.47, 31.23] },
    })).value;
    const feature = withFeature.layers[0].features[0];
    const form = new FormData();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=', 'base64');
    form.append('files', new Blob([png], { type: 'image/png' }), 'place.png');
    const uploaded = await request('POST', `/api/features/${feature.id}/attachments`, owner.sessionId, form);
    assert.equal(uploaded.status, 201);
    const attachment = uploaded.value.layers[0].features[0].attachments[0];
    const storedFile = path.join(tempDir, 'uploads', path.basename(attachment.url));
    const mediaPathAlias = attachment.url.replace('/uploads/', '/uploads//');
    assert.equal((await fetch(`${server.url}${mediaPathAlias}`)).status, 200);
    const share = (await request('POST', `${mapEndpoint}/share`, owner.sessionId, {})).value;
    const statsBefore = (await request('GET', '/api/admin/stats', admin.sessionId)).value;

    await t.test('favorites are stored per user and do not edit the map', async () => {
      const before = (await request('GET', mapEndpoint, owner.sessionId)).value;
      assert.equal((await request('PATCH', `${mapEndpoint}/favorite`, null, { favorite: true })).status, 401);
      assert.equal((await request('PATCH', `${mapEndpoint}/favorite`, outsider.sessionId, { favorite: true })).status, 403);
      assert.equal((await request('PATCH', `${mapEndpoint}/favorite`, owner.sessionId, { favorite: 'yes' })).status, 400);
      assert.deepEqual((await request('PATCH', `${mapEndpoint}/favorite`, owner.sessionId, { favorite: true })).value, { id: map.id, is_favorite: true });
      assert.equal((await request('PATCH', `${mapEndpoint}/favorite`, editor.sessionId, { favorite: true })).status, 200);
      assert.equal((await request('PATCH', `${mapEndpoint}/favorite`, viewer.sessionId, { favorite: true })).status, 200);
      assert.equal((await request('PATCH', `${mapEndpoint}/favorite`, editor.sessionId, { favorite: false })).status, 200);
      for (const account of [{ user: owner, favorite: true }, { user: editor, favorite: false }, { user: viewer, favorite: true }, { user: admin, favorite: false }]) {
        const maps = (await request('GET', '/api/maps', account.user.sessionId)).value;
        assert.equal(maps.find((item) => item.id === map.id).is_favorite, account.favorite);
      }
      const after = (await request('GET', mapEndpoint, owner.sessionId)).value;
      assert.equal(after.version, before.version);
      assert.equal(after.updated_at, before.updated_at);
    });

    socket = new WebSocket(`${server.wsUrl}?token=${editor.sessionId}`);
    const waitMessage = wsInbox(socket);
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'join', mapId: map.id }));
    assert.equal((await waitMessage((message) => message.type === 'joined')).canEdit, true);

    await t.test('trash is owner-managed and blocks editor, public and realtime access', async () => {
      assert.equal((await request('POST', `${mapEndpoint}/trash`, editor.sessionId)).status, 403);
      assert.equal((await request('POST', `${mapEndpoint}/trash`, viewer.sessionId)).status, 403);
      assert.equal((await request('POST', `${mapEndpoint}/trash`, outsider.sessionId)).status, 403);
      const result = await request('POST', `${mapEndpoint}/trash`, owner.sessionId);
      assert.equal(result.status, 200);
      assert.ok(result.value.deleted_at);
      assert.equal(result.value.is_favorite, true);
      assert.equal((await waitMessage((message) => message.action === 'map.deleted')).entityId, map.id);
      await waitMessage((message) => message.type === 'left');
      socket.send(JSON.stringify({ type: 'join', mapId: map.id }));
      await waitMessage((message) => message.type === 'error');
      for (const account of [owner, editor, viewer, admin]) {
        assert.equal((await request('GET', '/api/maps', account.sessionId)).value.some((item) => item.id === map.id), false);
        assert.equal((await request('GET', mapEndpoint, account.sessionId)).status, 404);
      }
      for (const account of [owner, admin]) {
        assert.equal((await request('GET', '/api/maps/trash', account.sessionId)).value.some((item) => item.id === map.id), true);
      }
      for (const account of [editor, viewer, outsider]) {
        assert.deepEqual((await request('GET', '/api/maps/trash', account.sessionId)).value, []);
        assert.equal((await request('POST', `${mapEndpoint}/restore`, account.sessionId)).status, 403);
      }
      assert.equal((await request('GET', `/api/public/${share.token}`)).status, 404);
      assert.equal((await fetch(`${server.url}${attachment.url}`)).status, 404);
      const encodedMediaUrl = attachment.url.replace('.', '%2E');
      assert.equal((await fetch(`${server.url}${encodedMediaUrl}`)).status, 404);
      assert.equal((await fetch(`${server.url}${mediaPathAlias}`)).status, 404);
      for (const [endpoint, recordId] of [['maps', map.id], ['layers', layer.id], ['features', feature.id], ['attachments', attachment.id]]) {
        const result = await request('GET', `/api/admin/${endpoint}`, admin.sessionId);
        assert.equal(result.value.some((item) => item.id === recordId), false);
      }
      const statsAfter = (await request('GET', '/api/admin/stats', admin.sessionId)).value;
      for (const key of ['maps', 'layers', 'features', 'attachments', 'shares']) assert.equal(statsAfter[key], statsBefore[key] - 1);
      for (const operation of [
        ['PATCH', mapEndpoint, { name: 'Should not change' }],
        ['PATCH', `${mapEndpoint}/favorite`, { favorite: false }],
        ['POST', `${mapEndpoint}/layers`, { name: 'Should not exist' }],
        ['PATCH', `/api/layers/${layer.id}`, { name: 'Should not change' }],
        ['DELETE', `/api/layers/${layer.id}`],
        ['POST', `/api/layers/${layer.id}/features`, { geometry: { type: 'Point', coordinates: [0, 0] } }],
        ['POST', `/api/layers/${layer.id}/features/bulk`, { features: [] }],
        ['PATCH', `/api/features/${feature.id}`, { name: 'Should not change' }],
        ['DELETE', `/api/features/${feature.id}`],
        ['DELETE', `/api/attachments/${attachment.id}`],
        ['POST', `${mapEndpoint}/share`, {}],
      ]) {
        assert.equal((await request(operation[0], operation[1], admin.sessionId, operation[2])).status, 404, operation[1]);
      }
      assert.equal((await request('POST', `/api/features/${feature.id}/attachments`, admin.sessionId, form)).status, 404);
      assert.equal((await request('DELETE', mapEndpoint, editor.sessionId)).status, 403);
      const updatedProject = (await request('GET', '/api/projects', owner.sessionId)).value.find((item) => item.id === project.id);
      assert.equal(updatedProject.map_count, 0);
      assert.ok(existsSync(storedFile));
    });

    await t.test('restoring retains layers, features, favorites, media and share links', async () => {
      const result = await request('POST', `${mapEndpoint}/restore`, owner.sessionId);
      assert.equal(result.status, 200);
      assert.equal(result.value.deleted_at, null);
      assert.equal(result.value.layers[0].id, layer.id);
      assert.equal(result.value.layers[0].features[0].id, feature.id);
      assert.equal(result.value.layers[0].features[0].attachments[0].id, attachment.id);
      assert.equal(result.value.layers[0].features[0].name, 'A place');
      assert.equal((await request('GET', `/api/public/${share.token}`)).status, 200);
      assert.equal((await fetch(`${server.url}${attachment.url}`)).status, 200);
      assert.equal((await request('GET', '/api/maps/trash', owner.sessionId)).value.length, 0);
      assert.equal((await request('GET', '/api/maps', owner.sessionId)).value.find((item) => item.id === map.id).is_favorite, true);
      socket.send(JSON.stringify({ type: 'join', mapId: map.id }));
      await waitMessage((message) => message.type === 'joined');
    });

    await t.test('permanent deletion remains compatible and removes preserved media', async () => {
      await request('POST', `${mapEndpoint}/trash`, owner.sessionId);
      assert.equal((await request('POST', `${mapEndpoint}/restore`, admin.sessionId)).status, 200);
      await request('POST', `${mapEndpoint}/trash`, admin.sessionId);
      assert.equal((await request('DELETE', mapEndpoint, owner.sessionId)).status, 204);
      assert.equal(existsSync(storedFile), false);
      assert.equal((await request('POST', `${mapEndpoint}/restore`, owner.sessionId)).status, 404);
      const second = (await request('POST', '/api/maps', owner.sessionId, { projectId: project.id, name: 'Compatibility' })).value;
      assert.equal((await request('DELETE', `/api/maps/${second.id}`, editor.sessionId)).status, 204);
    });
  } finally {
    socket?.terminate();
    if (server?.child && server.child.exitCode === null) {
      const exited = once(server.child, 'exit');
      server.child.kill();
      await exited;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
