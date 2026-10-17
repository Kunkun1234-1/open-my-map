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
      DB_PATH: path.join(directory, 'projects.sqlite'),
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

test('authenticated project metadata and deletion APIs enforce ownership and preserve maps', { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'omm-projects-test-'));
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
    const owner = await register('project-owner');
    const editor = await register('project-editor');
    const viewer = await register('project-viewer');
    const admin = (await request('POST', '/api/auth/login', null, {
      email: 'admin@openmymap.local', password: 'admin123',
    })).value;
    const createProject = async (name) => {
      const result = await request('POST', '/api/projects', owner.sessionId, { name });
      assert.equal(result.status, 201);
      return result.value;
    };

    await t.test('project creation shares metadata validation with editing', async () => {
      assert.equal((await request('POST', '/api/projects', owner.sessionId, { name: '   ' })).status, 400);
      assert.equal((await request('POST', '/api/projects', owner.sessionId, { name: 'x'.repeat(121) })).status, 400);
      assert.equal((await request('POST', '/api/projects', owner.sessionId, { name: 'Too much detail', description: 'x'.repeat(2001) })).status, 400);
      const created = await request('POST', '/api/projects', owner.sessionId, { name: '  Trimmed create  ', description: 'Valid' });
      assert.equal(created.status, 201);
      assert.equal(created.value.name, 'Trimmed create');
      assert.equal(created.value.description, 'Valid');
      assert.equal(await request('DELETE', `/api/projects/${created.value.id}`, owner.sessionId).then((result) => result.status), 204);
    });

    const project = await createProject('Metadata project');
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
      const invite = await request('POST', `/api/projects/${project.id}/members`, owner.sessionId, {
        email: account.user.email, role,
      });
      assert.equal(invite.status, 201);
    }

    await t.test('owner updates trimmed metadata and receives the list project shape', async () => {
      assert.equal((await request('PATCH', `/api/projects/${project.id}`, null, { name: 'No session' })).status, 401);
      const result = await request('PATCH', `/api/projects/${project.id}`, owner.sessionId, {
        name: '  Renamed project  ', description: 'A useful description',
      });
      assert.equal(result.status, 200);
      assert.equal(result.value.name, 'Renamed project');
      assert.equal(result.value.description, 'A useful description');
      assert.equal(result.value.my_role, 'owner');
      assert.equal(result.value.map_count, 0);
      assert.equal(result.value.member_count, 3);
      const listed = (await request('GET', '/api/projects', owner.sessionId)).value.find((item) => item.id === project.id);
      assert.equal(listed.name, 'Renamed project');
      assert.equal(listed.description, 'A useful description');
    });

    await t.test('editors and viewers cannot update or delete projects', async () => {
      for (const account of [editor, viewer]) {
        assert.equal((await request('PATCH', `/api/projects/${project.id}`, account.sessionId, { name: 'Forbidden' })).status, 403);
        assert.equal((await request('DELETE', `/api/projects/${project.id}`, account.sessionId)).status, 403);
      }
      assert.equal((await request('DELETE', `/api/projects/${project.id}`, null)).status, 401);
    });

    await t.test('metadata validation rejects missing, blank and oversized values', async () => {
      assert.equal((await request('PATCH', `/api/projects/${project.id}`, owner.sessionId, {})).status, 400);
      assert.equal((await request('PATCH', `/api/projects/${project.id}`, owner.sessionId, { name: '   ' })).status, 400);
      assert.equal((await request('PATCH', `/api/projects/${project.id}`, owner.sessionId, { name: 'x'.repeat(121) })).status, 400);
      assert.equal((await request('PATCH', `/api/projects/${project.id}`, owner.sessionId, { description: 'x'.repeat(2001) })).status, 400);
    });

    await t.test('missing projects return 404 for update and delete', async () => {
      assert.equal((await request('PATCH', '/api/projects/999999', owner.sessionId, { name: 'Missing' })).status, 404);
      assert.equal((await request('DELETE', '/api/projects/999999', owner.sessionId)).status, 404);
    });

    await t.test('active and trashed maps both block deletion', async () => {
      const map = (await request('POST', '/api/maps', owner.sessionId, { projectId: project.id, name: 'Blocking map' })).value;
      assert.equal((await request('GET', '/api/projects', owner.sessionId)).value.find((item) => item.id === project.id).total_map_count, 1);
      let result = await request('DELETE', `/api/projects/${project.id}`, owner.sessionId);
      assert.equal(result.status, 409);
      assert.match(result.value.error, /地图/);
      assert.equal((await request('POST', `/api/maps/${map.id}/trash`, owner.sessionId)).status, 200);
      const trashedOnlyProject = (await request('GET', '/api/projects', owner.sessionId)).value.find((item) => item.id === project.id);
      assert.equal(trashedOnlyProject.map_count, 0);
      assert.equal(trashedOnlyProject.total_map_count, 1);
      result = await request('DELETE', `/api/projects/${project.id}`, owner.sessionId);
      assert.equal(result.status, 409);
      assert.match(result.value.error, /回收站/);
      assert.equal((await request('DELETE', `/api/maps/${map.id}`, owner.sessionId)).status, 204);
    });

    await t.test('metadata changes become the latest project timestamp even when maps exist', async () => {
      const occupied = await createProject('Occupied project');
      const map = (await request('POST', '/api/maps', owner.sessionId, { projectId: occupied.id, name: 'Older map' })).value;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await request('PATCH', `/api/projects/${occupied.id}`, owner.sessionId, { name: 'Most recently edited project' });
      assert.equal(updated.status, 200);
      assert.ok(updated.value.updated_at > map.updated_at);
      assert.equal(updated.value.total_map_count, 1);
      const listed = (await request('GET', '/api/projects', owner.sessionId)).value;
      assert.equal(listed[0].id, occupied.id);
      assert.equal(listed[0].updated_at, updated.value.updated_at);
      assert.equal((await request('DELETE', `/api/maps/${map.id}`, owner.sessionId)).status, 204);
      assert.equal((await request('DELETE', `/api/projects/${occupied.id}`, owner.sessionId)).status, 204);
    });

    await t.test('owners and global admins can delete empty projects and operations are audited', async () => {
      assert.equal((await request('DELETE', `/api/projects/${project.id}`, owner.sessionId)).status, 204);
      assert.equal((await request('GET', '/api/projects', owner.sessionId)).value.some((item) => item.id === project.id), false);

      const adminProject = await createProject('Admin managed');
      const updated = await request('PATCH', `/api/projects/${adminProject.id}`, admin.sessionId, { name: 'Admin renamed' });
      assert.equal(updated.status, 200);
      assert.equal(updated.value.my_role, 'admin');
      assert.equal(updated.value.name, 'Admin renamed');
      assert.equal((await request('DELETE', `/api/projects/${adminProject.id}`, admin.sessionId)).status, 204);

      const audit = (await request('GET', '/api/admin/audit', admin.sessionId)).value;
      assert.ok(audit.some((item) => item.action === 'update' && item.entity_type === 'project' && item.entity_id === String(project.id)));
      assert.ok(audit.some((item) => item.action === 'delete' && item.entity_type === 'project' && item.entity_id === String(project.id)));
      assert.ok(audit.some((item) => item.action === 'update' && item.entity_type === 'project' && item.entity_id === String(adminProject.id)));
      assert.ok(audit.some((item) => item.action === 'delete' && item.entity_type === 'project' && item.entity_id === String(adminProject.id)));
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
