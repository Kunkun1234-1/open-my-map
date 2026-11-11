import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
      DB_PATH: path.join(directory, 'home-slides.sqlite'),
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

function imageBody(bytes, name) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), name);
  return form;
}

function storedName(backgroundUrl) {
  return new URLSearchParams(String(backgroundUrl).split('?')[1]).get('v');
}

test('dynamic home slides keep stable IDs, independent images and legacy compatibility', { timeout: 45_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-home-slides-test-'));
  const backgroundDir = path.join(directory, 'home-backgrounds');
  const tempDir = path.join(directory, 'upload-temp');
  const databasePath = path.join(directory, 'home-slides.sqlite');
  let server;
  let request;
  try {
    server = await startServer(directory);
    request = async (method, pathName, sessionId, body) => {
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
        name,
        email: `${name}@example.com`,
        password: 'secret1',
      });
      assert.equal(result.status, 201);
      return result.value;
    };
    const alice = await register('slides-alice');
    const bob = await register('slides-bob');

    await t.test('metadata supports adding, sorting and removing stable dynamic slides', async () => {
      assert.deepEqual(alice.user.homeSlides.map((slide) => slide.id), ['legacy-0', 'legacy-1', 'legacy-2']);
      const slides = [
        { id: 'alpha-slide', title: 'Alpha' },
        { id: 'bravo-slide', title: 'Bravo' },
        { id: 'charlie-slide', title: 'Charlie' },
        { id: 'delta-slide', title: 'Delta' },
      ];
      const saved = await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, { slides });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.value.user.homeSlides.map(({ id, title }) => ({ id, title })), slides);
      assert.deepEqual(saved.value.user.homeHeroTitles, ['Alpha', 'Bravo', 'Charlie']);

      for (const invalid of [
        [],
        [{ id: '1', title: 'numeric' }],
        [{ id: 'same', title: 'one' }, { id: 'same', title: 'two' }],
        [{ id: 'bad id', title: 'space' }],
        [{ id: 'ok', title: 'one\ntwo\nthree' }],
      ]) {
        assert.equal((await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, { slides: invalid })).status, 400);
      }
    });

    let alphaUrl;
    let bravoUrl;
    await t.test('each slide image is private, typed and independently replaceable', async () => {
      const alpha = await request('POST', '/api/auth/me/home-background?slide=alpha-slide', alice.sessionId, imageBody(png, 'alpha.txt'));
      assert.equal(alpha.status, 200);
      alphaUrl = alpha.value.user.homeSlides.find((slide) => slide.id === 'alpha-slide').backgroundUrl;
      assert.match(alphaUrl, /slide=alpha-slide&v=/);

      const bravo = await request('POST', '/api/auth/me/home-background?slide=bravo-slide', alice.sessionId, imageBody(gif, 'bravo.jpg'));
      assert.equal(bravo.status, 200);
      bravoUrl = bravo.value.user.homeSlides.find((slide) => slide.id === 'bravo-slide').backgroundUrl;
      assert.notEqual(storedName(alphaUrl), storedName(bravoUrl));
      assert.equal(bravo.value.user.homeSlides.find((slide) => slide.id === 'alpha-slide').backgroundUrl, alphaUrl);

      for (const [url, bytes, mime] of [[alphaUrl, png, 'image/png'], [bravoUrl, gif, 'image/gif']]) {
        const visible = await fetch(`${server.url}${url}`, { headers: { authorization: `Bearer ${alice.sessionId}` } });
        assert.equal(visible.status, 200);
        assert.equal(visible.headers.get('content-type'), mime);
        assert.equal(visible.headers.get('cache-control'), 'private, no-store');
        assert.equal(Buffer.compare(Buffer.from(await visible.arrayBuffer()), bytes), 0);
        assert.equal((await request('GET', url, bob.sessionId)).status, 404);
      }

      const bobSaved = await request('PATCH', '/api/auth/me/home-appearance', bob.sessionId, {
        slides: [{ id: 'bob-slide', title: 'Bob' }],
      });
      assert.equal(bobSaved.status, 200);
      const bobUpload = await request('POST', '/api/auth/me/home-background?slide=bob-slide', bob.sessionId, imageBody(png, 'bob.png'));
      assert.equal(bobUpload.status, 200);
      assert.equal((await request('GET', bobUpload.value.user.homeSlides[0].backgroundUrl, alice.sessionId)).status, 404);
    });

    await t.test('invalid or missing slide IDs fail before upload without temporary files', async () => {
      const before = [...readdirSync(tempDir)];
      assert.equal((await request('POST', '/api/auth/me/home-background?slide=../bad', alice.sessionId, imageBody(png, 'bad.png'))).status, 400);
      assert.equal((await request('POST', '/api/auth/me/home-background?slide=missing-slide', alice.sessionId, imageBody(png, 'missing.png'))).status, 404);
      assert.deepEqual(readdirSync(tempDir), before);
      assert.equal((await request('GET', '/api/auth/me/home-background?slide=99', alice.sessionId)).status, 404);
    });

    await t.test('sorting preserves images and deleting a slide only removes its orphaned file', async () => {
      const reordered = await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, {
        slides: [
          { id: 'bravo-slide', title: 'Bravo first' },
          { id: 'delta-slide', title: 'Delta second' },
          { id: 'alpha-slide', title: 'Alpha last' },
        ],
      });
      assert.equal(reordered.status, 200);
      assert.equal(reordered.value.user.homeSlides[0].backgroundUrl, bravoUrl);
      assert.equal(reordered.value.user.homeSlides[2].backgroundUrl, alphaUrl);
      const alphaStored = storedName(alphaUrl);
      const bravoStored = storedName(bravoUrl);

      const removed = await request('PATCH', '/api/auth/me/home-appearance', alice.sessionId, {
        slides: [
          { id: 'bravo-slide', title: 'Bravo first' },
          { id: 'delta-slide', title: 'Delta second' },
        ],
      });
      assert.equal(removed.status, 200);
      assert.equal(existsSync(path.join(backgroundDir, alphaStored)), false);
      assert.equal(existsSync(path.join(backgroundDir, bravoStored)), true);
    });

    let globalUrl;
    await t.test('legacy no-slide upload still sets every current slide and persists titles', async () => {
      const global = await request('POST', '/api/auth/me/home-background', alice.sessionId, imageBody(png, 'global.png'));
      assert.equal(global.status, 200);
      globalUrl = global.value.user.homeBackgroundUrl;
      const names = global.value.user.homeSlides.map((slide) => storedName(slide.backgroundUrl));
      assert.equal(new Set(names).size, 1);
      assert.equal(storedName(globalUrl), names[0]);
      assert.equal(existsSync(path.join(backgroundDir, storedName(bravoUrl))), false);
      assert.deepEqual(global.value.user.homeHeroTitles, ['Bravo first', 'Delta second', '']);
    });

    await t.test('legacy rows migrate to shared stable slides and reference-counted resets', async () => {
      await stopServer(server);
      const database = new DatabaseSync(databasePath);
      database.prepare(`
        UPDATE users
        SET home_slides_json = '[]', home_background_stored_name = ?, home_hero_titles = ?
        WHERE id = ?
      `).run(storedName(globalUrl), JSON.stringify(['Legacy one', 'Legacy two', 'Legacy three']), alice.user.id);
      database.close();
      server = await startServer(directory);

      const migrated = (await request('GET', '/api/auth/me', alice.sessionId)).value.user;
      assert.deepEqual(migrated.homeSlides.map((slide) => slide.id), ['legacy-0', 'legacy-1', 'legacy-2']);
      assert.deepEqual(migrated.homeSlides.map((slide) => slide.title), ['Legacy one', 'Legacy two', 'Legacy three']);
      assert.equal(new Set(migrated.homeSlides.map((slide) => storedName(slide.backgroundUrl))).size, 1);

      const legacyStored = storedName(globalUrl);
      const middle = await request('POST', '/api/auth/me/home-background?slide=1', alice.sessionId, imageBody(gif, 'middle.gif'));
      assert.equal(middle.status, 200);
      const middleStored = storedName(middle.value.user.homeSlides[1].backgroundUrl);
      assert.notEqual(middleStored, legacyStored);
      assert.equal(existsSync(path.join(backgroundDir, legacyStored)), true);

      assert.equal((await request('DELETE', '/api/auth/me/home-background?slide=legacy-0', alice.sessionId)).status, 200);
      assert.equal(existsSync(path.join(backgroundDir, legacyStored)), true);
      assert.equal((await request('DELETE', '/api/auth/me/home-background?slide=legacy-2', alice.sessionId)).status, 200);
      assert.equal(existsSync(path.join(backgroundDir, legacyStored)), false);
      assert.equal((await request('DELETE', '/api/auth/me/home-background?slide=legacy-1', alice.sessionId)).status, 200);
      assert.equal(existsSync(path.join(backgroundDir, middleStored)), false);
    });
  } finally {
    await stopServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});
