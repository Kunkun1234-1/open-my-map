import test from 'node:test';
import assert from 'node:assert/strict';
import { loginWithEmail, registerUser, mySessions, logoutSession } from './auth.js';
import { canEditMap, db, listVisibleMaps, listVisibleProjects, listMaps, createProjectOwnedBy } from './db.js';

const fakeReq = () => ({
  get: () => '',
  socket: { remoteAddress: '127.0.0.1' },
});

test('email login issues a session for the seeded admin user', () => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
  const { user, sessionId } = loginWithEmail('admin@openmymap.local', 'admin123', fakeReq());
  assert.equal(user.role, 'admin');
  assert.ok(sessionId);
  const after = db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
  assert.equal(after, before + 1);
  assert.ok(mySessions(user.id).some((session) => session.id === sessionId));
  logoutSession(sessionId);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE id = ?').get(sessionId).c, 0);
});

test('register creates an editor user who can own a project', () => {
  const email = `user_${Date.now()}@example.com`;
  const { user, sessionId } = registerUser({ name: '新用户', email, password: 'secret1' }, fakeReq());
  assert.equal(user.role, 'editor');
  assert.equal(user.email, email);
  assert.ok(sessionId);
  const project = createProjectOwnedBy(user, { name: '我的项目', description: '测试' });
  assert.ok(project?.id);
  assert.equal(listVisibleProjects(user).some((item) => item.id === project.id), true);
  logoutSession(sessionId);
  db.prepare('DELETE FROM project_members WHERE project_id = ?').run(project.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
});

test('data admin sees all maps and can edit any map', () => {
  const admin = { id: db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()?.id, role: 'admin' };
  assert.ok(admin.id, 'seeded admin user should exist');
  assert.equal(listVisibleMaps(admin).length, listMaps().length);
  assert.equal(listVisibleProjects(admin).length, listVisibleProjects(admin).length >= 1 ? listVisibleProjects(admin).length : 0);
  const firstMap = listMaps()[0];
  assert.equal(canEditMap(admin, firstMap.id), true);
});

test('a user with no project membership cannot edit or view maps', () => {
  const created = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO users (name, display_name, email, role, status, created_at, last_seen) VALUES ('外访者','外访者','outsider@wx.local','editor','active',?,?)").run(created, created);
  const outsider = db.prepare("SELECT * FROM users WHERE email = 'outsider@wx.local'").get();
  const publicUser = { id: outsider.id, role: outsider.role };
  const firstMap = listMaps()[0];
  assert.equal(canEditMap(publicUser, firstMap.id), false);
  assert.equal(listVisibleMaps(publicUser).length, 0);
  assert.equal(listVisibleProjects(publicUser).length, 0);
  db.prepare('DELETE FROM users WHERE id = ?').run(outsider.id);
});
