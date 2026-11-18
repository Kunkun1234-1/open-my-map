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
  return { child, url: `http://127.0.0.1:${port}` };
}

test('profile organization and research interests persist through the authenticated API', { timeout: 20_000 }, async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'omm-profile-fields-'));
  let server;
  try {
    server = await startServer(tempDir);
    const request = async (method, endpoint, sessionId, body) => {
      const headers = {};
      if (sessionId) headers.authorization = `Bearer ${sessionId}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${server.url}${endpoint}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, value: await response.json() };
    };
    const register = async (name) => {
      const result = await request('POST', '/api/auth/register', null, {
        name,
        email: `${name}@example.com`,
        password: 'secret1',
      });
      assert.equal(result.status, 201);
      return result.value;
    };

    const alice = await register('profile-alice');
    const bob = await register('profile-bob');
    assert.equal(alice.user.organization, '');
    assert.equal(alice.user.researchInterests, '');

    const saved = await request('PATCH', '/api/auth/me', alice.sessionId, {
      name: 'Alice',
      organization: '地图叙事研究中心',
      researchInterests: '空间人文、公众参与式制图',
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.value.user.organization, '地图叙事研究中心');
    assert.equal(saved.value.user.researchInterests, '空间人文、公众参与式制图');

    const partial = await request('PATCH', '/api/auth/me', alice.sessionId, {
      organization: '城市空间实验室',
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.value.user.displayName, 'Alice');
    assert.equal(partial.value.user.organization, '城市空间实验室');
    assert.equal(partial.value.user.researchInterests, '空间人文、公众参与式制图');

    const refreshed = await request('GET', '/api/auth/me', alice.sessionId);
    assert.equal(refreshed.value.user.organization, '城市空间实验室');
    assert.equal(refreshed.value.user.researchInterests, '空间人文、公众参与式制图');
    const relogged = await request('POST', '/api/auth/login', null, {
      email: alice.user.email,
      password: 'secret1',
    });
    assert.equal(relogged.value.user.organization, '城市空间实验室');
    assert.equal(relogged.value.user.researchInterests, '空间人文、公众参与式制图');

    const bobProfile = await request('GET', '/api/auth/me', bob.sessionId);
    assert.equal(bobProfile.value.user.organization, '');
    assert.equal(bobProfile.value.user.researchInterests, '');

    for (const invalid of [
      { organization: 42 },
      { researchInterests: ['maps'] },
      { organization: '机'.repeat(121) },
      { researchInterests: '图'.repeat(501) },
    ]) {
      const rejected = await request('PATCH', '/api/auth/me', alice.sessionId, invalid);
      assert.equal(rejected.status, 400);
    }
    const afterRejected = await request('GET', '/api/auth/me', alice.sessionId);
    assert.equal(afterRejected.value.user.organization, '城市空间实验室');
    assert.equal(afterRejected.value.user.researchInterests, '空间人文、公众参与式制图');
  } finally {
    if (server?.child && server.child.exitCode === null) {
      const exited = once(server.child, 'exit');
      server.child.kill();
      await exited;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
