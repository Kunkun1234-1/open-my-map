import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

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
      DB_PATH: path.join(directory, 'avatars.sqlite'),
      AVATAR_DIR: path.join(directory, 'avatars'),
      COVER_DIR: path.join(directory, 'covers'),
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

async function stopServer(server) {
  if (!server?.child || server.child.exitCode !== null) return;
  const exited = once(server.child, 'exit');
  server.child.kill();
  await exited;
}

function avatarBody(bytes, name, type = 'application/octet-stream', field = 'file') {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  return form;
}

function storedName(avatarUrl) {
  return new URLSearchParams(String(avatarUrl).split('?')[1]).get('v');
}

test('custom user avatars are private, persistent and isolated to the current account', { timeout: 45_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-user-avatar-test-'));
  const avatarDir = path.join(directory, 'avatars');
  const tempDir = path.join(directory, 'upload-temp');
  let server;
  try {
    server = await startServer(directory);
    const request = async (method, endpoint, sessionId, body) => {
      const headers = {};
      if (sessionId) headers.authorization = `Bearer ${sessionId}`;
      if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${endpoint}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      });
      const value = response.status === 204 ? null : await response.json().catch(() => null);
      return { status: response.status, value, response };
    };
    const register = async (name) => {
      const result = await request('POST', '/api/auth/register', null, {
        name, email: `${name}@example.com`, password: 'secret1',
      });
      assert.equal(result.status, 201);
      return result.value;
    };
    const alice = await register('avatar-alice');
    const bob = await register('avatar-bob');
    const legacyUrl = 'https://images.example.test/provider-avatar.png';
    const directDb = new DatabaseSync(path.join(directory, 'avatars.sqlite'));
    directDb.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(legacyUrl, alice.user.id);
    directDb.close();

    await t.test('legacy provider avatar remains the public-user fallback', async () => {
      const me = await request('GET', '/api/auth/me', alice.sessionId);
      assert.equal(me.status, 200);
      assert.equal(me.value.user.avatarUrl, legacyUrl);
      assert.equal((await request('GET', `/api/users/${alice.user.id}/avatar`, bob.sessionId)).status, 404);
    });

    await t.test('upload validation rejects unauthorized, missing, spoofed, multiple and oversized input cleanly', async () => {
      assert.equal((await request('POST', '/api/auth/me/avatar', null, avatarBody(png, 'avatar.png'))).status, 401);
      assert.equal((await request('POST', '/api/auth/me/avatar', alice.sessionId)).status, 400);
      assert.equal((await request('POST', '/api/auth/me/avatar', alice.sessionId, avatarBody(Buffer.from('<svg/>'), 'fake.png', 'image/png'))).status, 415);
      assert.equal((await request('POST', '/api/auth/me/avatar', alice.sessionId, avatarBody(png, 'avatar.png', 'image/png', 'image'))).status, 400);
      const multiple = avatarBody(png, 'one.png', 'image/png');
      multiple.append('file', new Blob([gif], { type: 'image/gif' }), 'two.gif');
      assert.equal((await request('POST', '/api/auth/me/avatar', alice.sessionId, multiple)).status, 400);
      assert.equal((await request('POST', '/api/auth/me/avatar', alice.sessionId, avatarBody(Buffer.alloc(5 * 1024 * 1024 + 1), 'huge.png', 'image/png'))).status, 413);
      assert.equal((await request('POST', `/api/users/${alice.user.id}/avatar`, bob.sessionId, avatarBody(png, 'other.png'))).status, 404);
      assert.deepEqual(readdirSync(avatarDir), []);
      assert.deepEqual(readdirSync(tempDir), []);
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.avatarUrl, legacyUrl);
    });

    let firstAvatarUrl;
    await t.test('current user upload is readable by another authenticated user with correct headers', async () => {
      const uploaded = await request('POST', '/api/auth/me/avatar', alice.sessionId, avatarBody(png, 'avatar.txt'));
      assert.equal(uploaded.status, 200);
      firstAvatarUrl = uploaded.value.user.avatarUrl;
      assert.match(firstAvatarUrl, new RegExp(`^/api/users/${alice.user.id}/avatar\\?v=`));
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.avatarUrl, firstAvatarUrl);
      assert.equal((await request('GET', firstAvatarUrl, null)).status, 401);
      const visible = await fetch(`${server.url}${firstAvatarUrl}`, { headers: { authorization: `Bearer ${bob.sessionId}` } });
      assert.equal(visible.status, 200);
      assert.equal(visible.headers.get('content-type'), 'image/png');
      assert.equal(visible.headers.get('cache-control'), 'private, no-store');
      assert.equal(visible.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(Buffer.compare(Buffer.from(await visible.arrayBuffer()), png), 0);
    });

    let replacedAvatarUrl;
    await t.test('replacement changes the URL, removes the old file and survives restart', async () => {
      const firstStored = storedName(firstAvatarUrl);
      assert.ok(existsSync(path.join(avatarDir, firstStored)));
      const replaced = await request('POST', '/api/auth/me/avatar', alice.sessionId, avatarBody(gif, 'replacement.jpg', 'image/jpeg'));
      assert.equal(replaced.status, 200);
      replacedAvatarUrl = replaced.value.user.avatarUrl;
      assert.notEqual(replacedAvatarUrl, firstAvatarUrl);
      assert.equal(existsSync(path.join(avatarDir, firstStored)), false);
      assert.deepEqual(readdirSync(avatarDir), [storedName(replacedAvatarUrl)]);
      assert.equal((await request('GET', firstAvatarUrl, bob.sessionId)).status, 404);

      await stopServer(server);
      server = await startServer(directory);
      const me = await request('GET', '/api/auth/me', alice.sessionId);
      assert.equal(me.value.user.avatarUrl, replacedAvatarUrl);
      const persisted = await fetch(`${server.url}${replacedAvatarUrl}`, { headers: { authorization: `Bearer ${bob.sessionId}` } });
      assert.equal(persisted.status, 200);
      assert.equal(persisted.headers.get('content-type'), 'image/gif');
      assert.equal(Buffer.compare(Buffer.from(await persisted.arrayBuffer()), gif), 0);
    });

    await t.test('reset deletes the custom file and restores the provider fallback', async () => {
      const replacedStored = storedName(replacedAvatarUrl);
      const reset = await request('DELETE', '/api/auth/me/avatar', alice.sessionId);
      assert.equal(reset.status, 200);
      assert.equal(reset.value.user.avatarUrl, legacyUrl);
      assert.equal(existsSync(path.join(avatarDir, replacedStored)), false);
      assert.deepEqual(readdirSync(avatarDir), []);
      assert.equal((await request('GET', `/api/users/${alice.user.id}/avatar`, bob.sessionId)).status, 404);
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.avatarUrl, legacyUrl);
    });
  } finally {
    await stopServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});
