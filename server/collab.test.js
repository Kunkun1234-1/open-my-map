import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProjectOwnedBy,
  db,
  inviteProjectMember,
  listProjectMembers,
  removeProjectMember,
  transferProjectOwnership,
  updateProjectMemberRole,
  normalizeGlobalRole,
} from './db.js';
import { createMapOp } from './realtime.js';
import { registerUser, logoutSession } from './auth.js';

const fakeReq = () => ({
  get: () => '',
  socket: { remoteAddress: '127.0.0.1' },
});

function cleanupUser(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM project_members WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

test('normalizeGlobalRole collapses viewer into editor', () => {
  assert.equal(normalizeGlobalRole('admin'), 'admin');
  assert.equal(normalizeGlobalRole('viewer'), 'editor');
  assert.equal(normalizeGlobalRole('editor'), 'editor');
});

test('project owner can invite, update, transfer and remove members', () => {
  const ownerEmail = `owner_${Date.now()}@example.com`;
  const memberEmail = `member_${Date.now()}@example.com`;
  const { user: owner, sessionId: ownerSession } = registerUser({ name: '所有者', email: ownerEmail, password: 'secret1' }, fakeReq());
  const { user: member, sessionId: memberSession } = registerUser({ name: '协作者', email: memberEmail, password: 'secret1' }, fakeReq());
  const project = createProjectOwnedBy(owner, { name: '协作项目' });

  const invited = inviteProjectMember(project.id, { email: memberEmail, role: 'viewer', actor: owner });
  assert.equal(invited.role, 'viewer');

  const updated = updateProjectMemberRole(project.id, member.id, 'editor', owner);
  assert.equal(updated.role, 'editor');

  const membersAfterInvite = listProjectMembers(project.id, owner);
  assert.equal(membersAfterInvite.length, 2);

  const transferred = transferProjectOwnership(project.id, member.id, owner);
  assert.ok(transferred.some((row) => row.userId === member.id && row.role === 'owner'));
  assert.ok(transferred.some((row) => row.userId === owner.id && row.role === 'editor'));

  removeProjectMember(project.id, owner.id, member);
  const remaining = listProjectMembers(project.id, member);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].userId, member.id);

  logoutSession(ownerSession);
  logoutSession(memberSession);
  db.prepare('DELETE FROM project_members WHERE project_id = ?').run(project.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  cleanupUser(owner.id);
  cleanupUser(member.id);
});

test('feature version increments on update', () => {
  const map = db.prepare('SELECT id FROM maps ORDER BY id LIMIT 1').get();
  assert.ok(map?.id);
  const layer = db.prepare('SELECT id FROM layers WHERE map_id = ? ORDER BY id LIMIT 1').get(map.id);
  assert.ok(layer?.id);
  const created = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO features (layer_id, type, name, description, geometry_json, style_json, created_at, updated_at, version)
    VALUES (?, 'Point', ?, '', ?, '{}', ?, ?, 1)
  `).run(layer.id, `协作测试点-${Date.now()}`, JSON.stringify({ type: 'Point', coordinates: [121.47, 31.23] }), created, created);
  const featureId = Number(insert.lastInsertRowid);
  const before = db.prepare('SELECT version FROM features WHERE id = ?').get(featureId);
  assert.equal(before.version, 1);
  db.prepare('UPDATE features SET name = ?, version = version + 1, updated_at = ? WHERE id = ?')
    .run('协作测试点-改', created, featureId);
  const after = db.prepare('SELECT version, name FROM features WHERE id = ?').get(featureId);
  assert.equal(after.version, 2);
  assert.equal(after.name, '协作测试点-改');
  db.prepare('DELETE FROM features WHERE id = ?').run(featureId);
});

test('createMapOp produces broadcastable payload', () => {
  const op = createMapOp({
    action: 'feature.updated',
    actor: { id: 1, displayName: '测试' },
    entity: { id: 9 },
    version: 3,
  });
  assert.equal(op.action, 'feature.updated');
  assert.equal(op.actor.name, '测试');
  assert.equal(op.version, 3);
  assert.ok(op.opId);
});
