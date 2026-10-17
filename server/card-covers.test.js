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
      DB_PATH: path.join(directory, 'covers.sqlite'),
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

function uploadBody(bytes, name, type = 'application/octet-stream', field = 'file', metadata = {}) {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  for (const [key, value] of Object.entries(metadata)) form.append(key, value);
  return form;
}

function storedName(coverUrl) {
  return new URLSearchParams(String(coverUrl).split('?')[1]).get('v');
}

test('protected project and map card covers persist, replace and reset safely', { timeout: 45_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-card-covers-test-'));
  const coverDir = path.join(directory, 'covers');
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
    const owner = await register('cover-owner');
    const editor = await register('cover-editor');
    const viewer = await register('cover-viewer');
    const outsider = await register('cover-outsider');
    const admin = (await request('POST', '/api/auth/login', null, {
      email: 'admin@openmymap.local', password: 'admin123',
    })).value;
    const project = (await request('POST', '/api/projects', owner.sessionId, { name: 'Cover project' })).value;
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      assert.equal((await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
        email: account.user.email, role,
      })).status, 201);
    }
    const projectCoverEndpoint = `/api/projects/${project.id}/cover`;

    await t.test('project covers require owner/admin writes and visible-member reads', async () => {
      assert.equal((await request('POST', projectCoverEndpoint, null, uploadBody(png, 'cover.png'))).status, 401);
      assert.equal((await request('POST', projectCoverEndpoint, editor.sessionId, uploadBody(png, 'cover.png'))).status, 403);
      assert.equal((await request('POST', projectCoverEndpoint, viewer.sessionId, uploadBody(png, 'cover.png'))).status, 403);

      const uploaded = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(png, 'cover.txt'));
      assert.equal(uploaded.status, 200);
      assert.match(uploaded.value.cover_url, new RegExp(`^/api/projects/${project.id}/cover\\?v=`));
      const firstStored = storedName(uploaded.value.cover_url);
      assert.ok(existsSync(path.join(coverDir, firstStored)));
      const listed = (await request('GET', '/api/projects', viewer.sessionId)).value.find((item) => item.id === project.id);
      assert.equal(listed.cover_url, uploaded.value.cover_url);
      assert.equal((await request('GET', projectCoverEndpoint, null)).status, 401);
      assert.equal((await request('GET', projectCoverEndpoint, outsider.sessionId)).status, 403);
      const visibleRead = await fetch(`${server.url}${projectCoverEndpoint}`, { headers: { authorization: `Bearer ${viewer.sessionId}` } });
      assert.equal(visibleRead.status, 200);
      assert.equal(visibleRead.headers.get('cache-control'), 'private, no-store');
      assert.equal(Buffer.compare(Buffer.from(await visibleRead.arrayBuffer()), png), 0);

      await stopServer(server);
      server = await startServer(directory);
      const afterRestart = await fetch(`${server.url}${projectCoverEndpoint}`, { headers: { authorization: `Bearer ${viewer.sessionId}` } });
      assert.equal(afterRestart.status, 200);
      assert.equal(Buffer.compare(Buffer.from(await afterRestart.arrayBuffer()), png), 0);

      const replaced = await request('POST', projectCoverEndpoint, admin.sessionId, uploadBody(gif, 'replacement.jpg', 'image/jpeg'));
      assert.equal(replaced.status, 200);
      assert.notEqual(replaced.value.cover_url, uploaded.value.cover_url);
      assert.equal(existsSync(path.join(coverDir, firstStored)), false);
      assert.deepEqual(readdirSync(coverDir), [storedName(replaced.value.cover_url)]);
      assert.equal((await request('GET', uploaded.value.cover_url, viewer.sessionId)).status, 404);

      const reset = await request('DELETE', projectCoverEndpoint, owner.sessionId);
      assert.equal(reset.status, 200);
      assert.equal(reset.value.cover_url, null);
      assert.deepEqual(readdirSync(coverDir), []);
      assert.equal((await request('GET', projectCoverEndpoint, viewer.sessionId)).status, 404);
    });

    await t.test('uploads reject missing, spoofed, unsupported-field and oversized files', async () => {
      assert.equal((await request('POST', projectCoverEndpoint, owner.sessionId)).status, 400);
      assert.equal((await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(Buffer.from('<svg/>'), 'fake.png', 'image/png'))).status, 415);
      assert.equal((await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(png, 'cover.png', 'image/png', 'image'))).status, 400);
      assert.equal((await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(Buffer.alloc(10 * 1024 * 1024 + 1), 'huge.png', 'image/png'))).status, 413);
      assert.deepEqual(readdirSync(coverDir), []);
    });

    await t.test('project metadata and cover upload or reset commit together', async () => {
      const baseline = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(png, 'baseline.png'));
      assert.equal(baseline.status, 200);
      const baselineStored = storedName(baseline.value.cover_url);
      assert.ok(Number.isInteger(baseline.value.version));

      const invalidVersion = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(gif, 'invalid-version.gif', 'image/gif', 'file', {
        name: 'Must not persist', expectedVersion: '0',
      }));
      assert.equal(invalidVersion.status, 400);
      assert.deepEqual(readdirSync(coverDir), [baselineStored]);
      assert.deepEqual(readdirSync(path.join(directory, 'upload-temp')), []);

      const invalid = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(gif, 'invalid.gif', 'image/gif', 'file', {
        name: '   ', description: 'Must not persist',
      }));
      assert.equal(invalid.status, 400);
      const afterInvalid = (await request('GET', '/api/projects', owner.sessionId)).value.find((item) => item.id === project.id);
      assert.equal(afterInvalid.name, 'Cover project');
      assert.equal(afterInvalid.description, '');
      assert.equal(afterInvalid.cover_url, baseline.value.cover_url);
      assert.deepEqual(readdirSync(coverDir), [baselineStored]);
      assert.deepEqual(readdirSync(path.join(directory, 'upload-temp')), []);

      const combined = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(gif, 'combined.gif', 'image/gif', 'file', {
        name: '  Combined project  ', description: 'Combined description', expectedVersion: String(baseline.value.version),
      }));
      assert.equal(combined.status, 200);
      assert.equal(combined.value.name, 'Combined project');
      assert.equal(combined.value.description, 'Combined description');
      assert.ok(combined.value.cover_url);
      assert.notEqual(combined.value.cover_url, baseline.value.cover_url);
      assert.equal(combined.value.version, baseline.value.version + 1);
      assert.equal(existsSync(path.join(coverDir, baselineStored)), false);
      const combinedStored = storedName(combined.value.cover_url);

      const staleUpload = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(png, 'stale-project.png', 'image/png', 'file', {
        name: 'Stale project', description: 'Must not persist', expectedVersion: String(baseline.value.version),
      }));
      assert.equal(staleUpload.status, 409);
      assert.equal(staleUpload.value.conflict, true);
      assert.equal(staleUpload.value.currentVersion, combined.value.version);
      assert.equal(staleUpload.value.latest.name, combined.value.name);
      assert.deepEqual(readdirSync(coverDir), [combinedStored]);
      assert.deepEqual(readdirSync(path.join(directory, 'upload-temp')), []);

      const invalidReset = await request('DELETE', projectCoverEndpoint, owner.sessionId, {
        name: '', description: 'Must not replace combined metadata', expectedVersion: combined.value.version,
      });
      assert.equal(invalidReset.status, 400);
      const invalidResetVersion = await request('DELETE', projectCoverEndpoint, owner.sessionId, {
        name: 'Must not persist', expectedVersion: 'invalid',
      });
      assert.equal(invalidResetVersion.status, 400);
      const afterInvalidReset = (await request('GET', '/api/projects', owner.sessionId)).value.find((item) => item.id === project.id);
      assert.equal(afterInvalidReset.name, 'Combined project');
      assert.equal(afterInvalidReset.description, 'Combined description');
      assert.equal(afterInvalidReset.cover_url, combined.value.cover_url);
      assert.ok(existsSync(path.join(coverDir, storedName(combined.value.cover_url))));

      const staleReset = await request('DELETE', projectCoverEndpoint, owner.sessionId, {
        name: 'Stale reset', description: 'Must not persist', expectedVersion: baseline.value.version,
      });
      assert.equal(staleReset.status, 409);
      assert.equal(staleReset.value.currentVersion, combined.value.version);
      assert.ok(existsSync(path.join(coverDir, combinedStored)));

      const reset = await request('DELETE', projectCoverEndpoint, owner.sessionId, {
        name: 'Reset project', description: 'Reset description', expectedVersion: combined.value.version,
      });
      assert.equal(reset.status, 200);
      assert.equal(reset.value.name, 'Reset project');
      assert.equal(reset.value.description, 'Reset description');
      assert.equal(reset.value.cover_url, null);
      assert.equal(reset.value.version, combined.value.version + 1);
      assert.deepEqual(readdirSync(coverDir), []);

      const metadataWithoutCover = await request('DELETE', projectCoverEndpoint, owner.sessionId, {
        description: 'Metadata without a cover', expectedVersion: reset.value.version,
      });
      assert.equal(metadataWithoutCover.status, 200);
      assert.equal(metadataWithoutCover.value.description, 'Metadata without a cover');
      assert.equal(metadataWithoutCover.value.version, reset.value.version + 1);
      assert.equal(metadataWithoutCover.value.cover_url, null);

      const staleNoOp = await request('DELETE', projectCoverEndpoint, owner.sessionId, {
        expectedVersion: reset.value.version,
      });
      assert.equal(staleNoOp.status, 409);
      assert.equal(staleNoOp.value.currentVersion, metadataWithoutCover.value.version);
    });

    const map = (await request('POST', '/api/maps', owner.sessionId, {
      projectId: project.id, name: 'Covered map', description: 'Keep me',
    })).value;
    const mapCoverEndpoint = `/api/maps/${map.id}/cover`;

    await t.test('map owners and editors replace covers without clobbering map data', async () => {
      const uploaded = await request('POST', mapCoverEndpoint, owner.sessionId, uploadBody(png, 'map.png'));
      assert.equal(uploaded.status, 200);
      assert.equal(uploaded.value.version, map.version + 1);
      assert.equal(uploaded.value.name, map.name);
      assert.equal(uploaded.value.description, map.description);
      assert.equal(uploaded.value.project_id, map.project_id);
      assert.deepEqual(uploaded.value.layers, map.layers);
      assert.ok(uploaded.value.cover_url);
      const firstStored = storedName(uploaded.value.cover_url);

      assert.equal((await request('POST', mapCoverEndpoint, viewer.sessionId, uploadBody(gif, 'denied.gif'))).status, 403);
      assert.equal((await request('DELETE', mapCoverEndpoint, viewer.sessionId)).status, 403);
      assert.equal((await request('GET', mapCoverEndpoint, outsider.sessionId)).status, 403);
      const viewerRead = await fetch(`${server.url}${mapCoverEndpoint}`, { headers: { authorization: `Bearer ${viewer.sessionId}` } });
      assert.equal(viewerRead.status, 200);
      assert.equal(viewerRead.headers.get('cache-control'), 'private, no-store');
      assert.equal(Buffer.compare(Buffer.from(await viewerRead.arrayBuffer()), png), 0);

      const replaced = await request('POST', mapCoverEndpoint, editor.sessionId, uploadBody(gif, 'map.gif'));
      assert.equal(replaced.status, 200);
      assert.equal(replaced.value.version, uploaded.value.version + 1);
      assert.notEqual(replaced.value.cover_url, uploaded.value.cover_url);
      assert.equal(existsSync(path.join(coverDir, firstStored)), false);
      const reset = await request('DELETE', mapCoverEndpoint, admin.sessionId);
      assert.equal(reset.status, 200);
      assert.equal(reset.value.cover_url, null);
      assert.equal(reset.value.version, replaced.value.version + 1);
      assert.equal(existsSync(path.join(coverDir, storedName(replaced.value.cover_url))), false);
      const adminUploaded = await request('POST', mapCoverEndpoint, admin.sessionId, uploadBody(gif, 'admin-map.gif'));
      assert.equal(adminUploaded.status, 200);
      assert.equal(adminUploaded.value.version, reset.value.version + 1);
      const persisted = (await request('GET', `/api/maps/${map.id}`, viewer.sessionId)).value;
      assert.equal(persisted.cover_url, adminUploaded.value.cover_url);
      assert.equal(persisted.name, map.name);
      assert.equal(persisted.description, map.description);
    });

    await t.test('map metadata and cover changes commit together with optimistic version checks', async () => {
      const baseline = (await request('GET', `/api/maps/${map.id}`, owner.sessionId)).value;
      const baselineStored = storedName(baseline.cover_url);
      const combined = await request('POST', mapCoverEndpoint, editor.sessionId, uploadBody(png, 'combined-map.png', 'image/png', 'file', {
        name: '  Combined map  ',
        description: 'Combined map description',
        expectedVersion: String(baseline.version),
      }));
      assert.equal(combined.status, 200);
      assert.equal(combined.value.name, 'Combined map');
      assert.equal(combined.value.description, 'Combined map description');
      assert.equal(combined.value.version, baseline.version + 1);
      assert.equal(combined.value.project_id, baseline.project_id);
      assert.equal(combined.value.base_map, baseline.base_map);
      assert.deepEqual(combined.value.layers, baseline.layers);
      assert.notEqual(combined.value.cover_url, baseline.cover_url);
      assert.equal(existsSync(path.join(coverDir, baselineStored)), false);
      const combinedStored = storedName(combined.value.cover_url);

      const stale = await request('POST', mapCoverEndpoint, owner.sessionId, uploadBody(gif, 'stale-map.gif', 'image/gif', 'file', {
        name: 'Must not persist',
        description: 'Must not persist',
        expectedVersion: String(baseline.version),
      }));
      assert.equal(stale.status, 409);
      assert.equal(stale.value.conflict, true);
      assert.equal(stale.value.latest.version, combined.value.version);
      assert.deepEqual(readdirSync(coverDir), [combinedStored]);
      assert.deepEqual(readdirSync(path.join(directory, 'upload-temp')), []);

      const invalid = await request('POST', mapCoverEndpoint, owner.sessionId, uploadBody(gif, 'invalid-map.gif', 'image/gif', 'file', {
        name: '   ',
        description: 'Must not persist',
        expectedVersion: String(combined.value.version),
      }));
      assert.equal(invalid.status, 400);
      const spoofed = await request('POST', mapCoverEndpoint, owner.sessionId, uploadBody(Buffer.from('<svg/>'), 'spoofed-map.png', 'image/png', 'file', {
        name: 'Must not persist',
        expectedVersion: String(combined.value.version),
      }));
      assert.equal(spoofed.status, 415);
      const afterRejectedUploads = (await request('GET', `/api/maps/${map.id}`, owner.sessionId)).value;
      assert.equal(afterRejectedUploads.name, combined.value.name);
      assert.equal(afterRejectedUploads.description, combined.value.description);
      assert.equal(afterRejectedUploads.version, combined.value.version);
      assert.equal(afterRejectedUploads.cover_url, combined.value.cover_url);
      assert.deepEqual(readdirSync(coverDir), [combinedStored]);
      assert.deepEqual(readdirSync(path.join(directory, 'upload-temp')), []);

      const invalidReset = await request('DELETE', mapCoverEndpoint, owner.sessionId, {
        name: '',
        description: 'Must not persist',
        expectedVersion: combined.value.version,
      });
      assert.equal(invalidReset.status, 400);
      const staleReset = await request('DELETE', mapCoverEndpoint, owner.sessionId, {
        name: 'Must not persist',
        expectedVersion: baseline.version,
      });
      assert.equal(staleReset.status, 409);
      const afterRejectedResets = (await request('GET', `/api/maps/${map.id}`, owner.sessionId)).value;
      assert.equal(afterRejectedResets.name, combined.value.name);
      assert.equal(afterRejectedResets.version, combined.value.version);
      assert.equal(afterRejectedResets.cover_url, combined.value.cover_url);

      const reset = await request('DELETE', mapCoverEndpoint, owner.sessionId, {
        name: 'Reset map',
        description: 'Reset map description',
        expectedVersion: combined.value.version,
      });
      assert.equal(reset.status, 200);
      assert.equal(reset.value.name, 'Reset map');
      assert.equal(reset.value.description, 'Reset map description');
      assert.equal(reset.value.cover_url, null);
      assert.equal(reset.value.version, combined.value.version + 1);
      assert.deepEqual(readdirSync(coverDir), []);

      const metadataOnlyReset = await request('DELETE', mapCoverEndpoint, editor.sessionId, {
        description: 'Metadata without an existing cover',
        expectedVersion: reset.value.version,
      });
      assert.equal(metadataOnlyReset.status, 200);
      assert.equal(metadataOnlyReset.value.name, reset.value.name);
      assert.equal(metadataOnlyReset.value.description, 'Metadata without an existing cover');
      assert.equal(metadataOnlyReset.value.cover_url, null);
      assert.equal(metadataOnlyReset.value.version, reset.value.version + 1);

      const noOp = await request('DELETE', mapCoverEndpoint, owner.sessionId);
      assert.equal(noOp.status, 200);
      assert.equal(noOp.value.version, metadataOnlyReset.value.version);
      const coverOnly = await request('POST', mapCoverEndpoint, owner.sessionId, uploadBody(gif, 'cover-only.gif'));
      assert.equal(coverOnly.status, 200);
      assert.equal(coverOnly.value.name, metadataOnlyReset.value.name);
      assert.equal(coverOnly.value.description, metadataOnlyReset.value.description);
      assert.equal(coverOnly.value.version, metadataOnlyReset.value.version + 1);
      assert.ok(coverOnly.value.cover_url);
    });

    await t.test('trashed covers remain owner/admin readable but immutable and permanent deletion cleans files', async () => {
      const beforeTrash = (await request('GET', `/api/maps/${map.id}`, owner.sessionId)).value;
      const mapStored = storedName(beforeTrash.cover_url);
      assert.equal((await request('POST', `/api/maps/${map.id}/trash`, owner.sessionId)).status, 200);
      assert.equal((await request('GET', mapCoverEndpoint, editor.sessionId)).status, 403);
      assert.equal((await request('GET', mapCoverEndpoint, viewer.sessionId)).status, 403);
      assert.equal((await request('GET', mapCoverEndpoint, owner.sessionId)).status, 200);
      assert.equal((await request('GET', mapCoverEndpoint, admin.sessionId)).status, 200);
      assert.equal((await request('POST', mapCoverEndpoint, owner.sessionId, uploadBody(png, 'new.png'))).status, 404);
      assert.equal((await request('DELETE', mapCoverEndpoint, owner.sessionId)).status, 404);
      assert.ok(existsSync(path.join(coverDir, mapStored)));
      assert.equal((await request('DELETE', `/api/maps/${map.id}`, owner.sessionId)).status, 204);
      assert.equal(existsSync(path.join(coverDir, mapStored)), false);
    });

    await t.test('empty project deletion removes its persisted cover', async () => {
      const uploaded = await request('POST', projectCoverEndpoint, owner.sessionId, uploadBody(png, 'project-final.png'));
      assert.equal(uploaded.status, 200);
      const projectStored = storedName(uploaded.value.cover_url);
      assert.ok(existsSync(path.join(coverDir, projectStored)));
      assert.equal((await request('DELETE', `/api/projects/${project.id}`, owner.sessionId)).status, 204);
      assert.equal(existsSync(path.join(coverDir, projectStored)), false);
    });
  } finally {
    await stopServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});
