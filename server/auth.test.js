import test from 'node:test';
import assert from 'node:assert/strict';
import { loginWithEmail, registerUser, mySessions, logoutSession, updateProfile } from './auth.js';
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

test('profile organization and research interests persist, update partially and remain account-scoped', () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const first = registerUser({ name: '研究者甲', email: `profile_a_${suffix}@example.com`, password: 'secret1' }, fakeReq());
  const second = registerUser({ name: '研究者乙', email: `profile_b_${suffix}@example.com`, password: 'secret1' }, fakeReq());
  try {
    assert.equal(first.user.organization, '');
    assert.equal(first.user.researchInterests, '');

    const saved = updateProfile(first.user.id, {
      name: '研究者甲',
      organization: '地图叙事研究中心',
      researchInterests: '空间人文、公众参与式制图',
    });
    assert.equal(saved.organization, '地图叙事研究中心');
    assert.equal(saved.researchInterests, '空间人文、公众参与式制图');

    const partial = updateProfile(first.user.id, { organization: '城市空间实验室' });
    assert.equal(partial.displayName, '研究者甲');
    assert.equal(partial.organization, '城市空间实验室');
    assert.equal(partial.researchInterests, '空间人文、公众参与式制图');

    const relogged = loginWithEmail(first.user.email, 'secret1', fakeReq());
    assert.equal(relogged.user.organization, '城市空间实验室');
    assert.equal(relogged.user.researchInterests, '空间人文、公众参与式制图');
    logoutSession(relogged.sessionId);

    const untouched = loginWithEmail(second.user.email, 'secret1', fakeReq());
    assert.equal(untouched.user.organization, '');
    assert.equal(untouched.user.researchInterests, '');
    logoutSession(untouched.sessionId);

    // Older accounts can have an empty display name; editing optional fields must preserve both name columns.
    db.prepare("UPDATE users SET display_name = '' WHERE id = ?").run(second.user.id);
    assert.equal(updateProfile(second.user.id, { organization: '旧账号机构' }).displayName, '研究者乙');
    const legacy = db.prepare('SELECT name, display_name FROM users WHERE id = ?').get(second.user.id);
    assert.equal(legacy.name, '研究者乙');
    assert.equal(legacy.display_name, '');

    const beforeInvalid = loginWithEmail(first.user.email, 'secret1', fakeReq());
    logoutSession(beforeInvalid.sessionId);
    for (const invalid of [
      { organization: 42 },
      { researchInterests: ['maps'] },
      { organization: '机'.repeat(121) },
      { researchInterests: '图'.repeat(501) },
      { organization: '不应保存', researchInterests: ['maps'] },
    ]) {
      assert.throws(() => updateProfile(first.user.id, invalid), (error) => error.status === 400);
    }
    const afterInvalid = loginWithEmail(first.user.email, 'secret1', fakeReq());
    assert.equal(afterInvalid.user.organization, beforeInvalid.user.organization);
    assert.equal(afterInvalid.user.researchInterests, beforeInvalid.user.researchInterests);
    logoutSession(afterInvalid.sessionId);
  } finally {
    for (const account of [first, second]) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(account.user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(account.user.id);
    }
  }
});

test('data admin retains management access to any map', () => {
  const admin = { id: db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()?.id, role: 'admin' };
  assert.ok(admin.id, 'seeded admin user should exist');
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
