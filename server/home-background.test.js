import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
      DB_PATH: path.join(directory, 'home-background.sqlite'),
      HOME_BACKGROUND_DIR: path.join(directory, 'home-backgrounds'),
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

function imageBody(bytes, name, type = 'application/octet-stream', field = 'file') {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  return form;
}

function storedName(backgroundUrl) {
  return new URLSearchParams(String(backgroundUrl).split('?')[1]).get('v');
}

test('custom home backgrounds are account-scoped, persistent and safely replaceable', { timeout: 45_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-home-background-test-'));
  const backgroundDir = path.join(directory, 'home-backgrounds');
  const tempDir = path.join(directory, 'upload-temp');
  let server;
  try {
    server = await startServer(directory);
    const endpoint = '/api/auth/me/home-background';
    const request = async (method, pathName, sessionId, body) => {
      const headers = {};
      if (sessionId) headers.authorization = `Bearer ${sessionId}`;
      if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${pathName}`, {
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
    const alice = await register('background-alice');
    const bob = await register('background-bob');

    await t.test('default public user shape remains empty and reads require the current account', async () => {
      assert.equal(alice.user.homeBackgroundUrl, '');
      assert.deepEqual(alice.user.homeHeroTitles, ['', '', '']);
      assert.equal((await request('GET', endpoint, null)).status, 401);
      assert.equal((await request('GET', endpoint, alice.sessionId)).status, 404);
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.homeBackgroundUrl, '');
    });

    await t.test('validation rejects missing, spoofed, wrong-field, multiple and oversized files without leftovers', async () => {
      assert.equal((await request('POST', endpoint, null, imageBody(png, 'background.png'))).status, 401);
      assert.equal((await request('POST', endpoint, alice.sessionId)).status, 400);
      assert.equal((await request('POST', endpoint, alice.sessionId, imageBody(Buffer.from('<svg/>'), 'fake.png', 'image/png'))).status, 415);
      assert.equal((await request('POST', endpoint, alice.sessionId, imageBody(png, 'background.png', 'image/png', 'image'))).status, 400);
      const multiple = imageBody(png, 'one.png', 'image/png');
      multiple.append('file', new Blob([gif], { type: 'image/gif' }), 'two.gif');
      assert.equal((await request('POST', endpoint, alice.sessionId, multiple)).status, 400);
      assert.equal((await request('POST', endpoint, alice.sessionId, imageBody(Buffer.alloc(10 * 1024 * 1024 + 1), 'huge.png', 'image/png'))).status, 413);
      assert.equal((await request('POST', `/api/users/${alice.user.id}/home-background`, bob.sessionId, imageBody(png, 'other.png'))).status, 404);
      assert.deepEqual(readdirSync(backgroundDir), []);
      assert.deepEqual(readdirSync(tempDir), []);
    });

    const savedTitles = ['第一行\n第二行', '', 'Third headline'];
    await t.test('three hero titles persist independently and reject invalid shapes', async () => {
      assert.equal((await request('PATCH', '/api/auth/me/home-appearance', null, { titles: savedTitles })).status, 401);
      const saved = await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, {
        titles: ['  第一行\r\n第二行  ', '', '  Third headline  '],
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.value.user.homeHeroTitles, savedTitles);
      assert.equal(saved.value.user.homeBackgroundUrl, '');
      assert.equal(saved.value.user.displayName, alice.user.displayName);
      assert.deepEqual((await request('GET', '/api/auth/me', bob.sessionId)).value.user.homeHeroTitles, ['', '', '']);

      for (const titles of [
        'not-an-array',
        ['', ''],
        ['', '', '', ''],
        ['', 7, ''],
        ['x'.repeat(121), '', ''],
        ['one\ntwo\nthree', '', ''],
      ]) {
        assert.equal((await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, { titles })).status, 400);
      }
      assert.deepEqual((await request('GET', '/api/auth/me', alice.sessionId)).value.user.homeHeroTitles, savedTitles);
    });

    let firstUrl;
    await t.test('upload returns a consistent user and only the same account can read it', async () => {
      const uploaded = await request('POST', endpoint, alice.sessionId, imageBody(png, 'background.txt'));
      assert.equal(uploaded.status, 200);
      firstUrl = uploaded.value.user.homeBackgroundUrl;
      assert.match(firstUrl, /^\/api\/auth\/me\/home-background\?v=/);
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.homeBackgroundUrl, firstUrl);
      assert.equal((await request('GET', firstUrl, null)).status, 401);
      assert.equal((await request('GET', firstUrl, bob.sessionId)).status, 404);
      const visible = await fetch(`${server.url}${firstUrl}`, { headers: { authorization: `Bearer ${alice.sessionId}` } });
      assert.equal(visible.status, 200);
      assert.equal(visible.headers.get('content-type'), 'image/png');
      assert.equal(visible.headers.get('cache-control'), 'private, no-store');
      assert.equal(visible.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(Buffer.compare(Buffer.from(await visible.arrayBuffer()), png), 0);
    });

    let replacementUrl;
    await t.test('replacement changes version URL, cleans old file and survives restart', async () => {
      const firstStored = storedName(firstUrl);
      assert.ok(existsSync(path.join(backgroundDir, firstStored)));
      const replaced = await request('POST', endpoint, alice.sessionId, imageBody(gif, 'replacement.jpg', 'image/jpeg'));
      assert.equal(replaced.status, 200);
      replacementUrl = replaced.value.user.homeBackgroundUrl;
      assert.notEqual(replacementUrl, firstUrl);
      assert.equal(existsSync(path.join(backgroundDir, firstStored)), false);
      assert.deepEqual(readdirSync(backgroundDir), [storedName(replacementUrl)]);
      assert.equal((await request('GET', firstUrl, alice.sessionId)).status, 404);

      await stopServer(server);
      server = await startServer(directory);
      const restartedUser = (await request('GET', '/api/auth/me', alice.sessionId)).value.user;
      assert.equal(restartedUser.homeBackgroundUrl, replacementUrl);
      assert.deepEqual(restartedUser.homeHeroTitles, savedTitles);
      const persisted = await fetch(`${server.url}${replacementUrl}`, { headers: { authorization: `Bearer ${alice.sessionId}` } });
      assert.equal(persisted.status, 200);
      assert.equal(persisted.headers.get('content-type'), 'image/gif');
      assert.equal(Buffer.compare(Buffer.from(await persisted.arrayBuffer()), gif), 0);
    });

    await t.test('another account has independent state and reset restores the default', async () => {
      const bobUpload = await request('POST', endpoint, bob.sessionId, imageBody(png, 'bob.png'));
      assert.equal(bobUpload.status, 200);
      assert.notEqual(bobUpload.value.user.homeBackgroundUrl, replacementUrl);
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.homeBackgroundUrl, replacementUrl);
      assert.equal((await request('GET', replacementUrl, bob.sessionId)).status, 404);

      const aliceStored = storedName(replacementUrl);
      const reset = await request('DELETE', endpoint, alice.sessionId);
      assert.equal(reset.status, 200);
      assert.equal(reset.value.user.homeBackgroundUrl, '');
      assert.equal(existsSync(path.join(backgroundDir, aliceStored)), false);
      assert.equal((await request('GET', endpoint, alice.sessionId)).status, 404);
      assert.equal((await request('GET', '/api/auth/me', alice.sessionId)).value.user.homeBackgroundUrl, '');

      const titlesReset = await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, { titles: [] });
      assert.equal(titlesReset.status, 200);
      assert.deepEqual(titlesReset.value.user.homeHeroTitles, ['', '', '']);
      assert.equal(titlesReset.value.user.homeBackgroundUrl, '');

      const bobReset = await request('DELETE', endpoint, bob.sessionId);
      assert.equal(bobReset.status, 200);
      assert.equal(bobReset.value.user.homeBackgroundUrl, '');
      assert.deepEqual(readdirSync(backgroundDir), []);
    });
  } finally {
    await stopServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});
