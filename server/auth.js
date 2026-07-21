import crypto from 'node:crypto';
import {
  audit, createRegisteredUser, createSession, db, deleteSession, deleteSessionsByUser,
  getSessionRow, getUserById, getUserByEmail, hashPassword, listSessionsByUser, now,
  publicUser, touchSession, verifyPassword,
} from './db.js';

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const MIN_PASSWORD_LENGTH = 6;

function readToken(req) {
  const header = req.get('authorization') || req.get('Authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return '';
}

function clientInfo(req) {
  const forwarded = req.get('x-forwarded-for') || '';
  return {
    ip: String(forwarded.split(',')[0] || req.socket?.remoteAddress || '').trim(),
    userAgent: String(req.get('user-agent') || '').slice(0, 240),
  };
}

const touchUserSeen = db.prepare('UPDATE users SET last_seen = ? WHERE id = ?');

// 中间件：加载当前会话与用户，注入 req.session / req.user。不强制登录。
export function loadSession(req, res, next) {
  const token = readToken(req);
  const sessionRow = getSessionRow(token);
  req.sessionId = sessionRow?.id || null;
  req.session = sessionRow || null;
  if (sessionRow) {
    const user = getUserById(sessionRow.user_id);
    req.user = user && user.status !== 'disabled' ? publicUser(user) : null;
    if (req.user) {
      touchSession(sessionRow.id);
      touchUserSeen.run(now(), user.id);
    }
  } else {
    req.user = null;
  }
  next();
}

export function requireUser(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: '请先登录' });
}

export function requireDataAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: '需要数据管理员权限' });
}

function requireProjectRoleForMap(minRoles) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    if (req.user.role === 'admin') return next();
    const mapId = id(req.params.mapId);
    const membership = db.prepare(`
      SELECT pm.role FROM project_members pm
      JOIN maps m ON m.project_id = pm.project_id
      WHERE m.id = ? AND pm.user_id = ?
    `).get(mapId, req.user.id);
    if (membership && minRoles.includes(membership.role)) return next();
    res.status(403).json({ error: '无权修改该地图' });
  };
}

const requireEditorForMap = requireProjectRoleForMap(['owner', 'editor']);
const requireOwnerForMap = requireProjectRoleForMap(['owner']);

export { requireEditorForMap, requireOwnerForMap };

export function roleForMap(user, mapId) {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  const row = db.prepare(`
    SELECT pm.role FROM project_members pm
    JOIN maps m ON m.project_id = pm.project_id
    WHERE m.id = ? AND pm.user_id = ?
  `).get(mapId, user.id);
  return row?.role || null;
}

function issueSession(user, req) {
  const sessionId = crypto.randomBytes(32).toString('base64url');
  createSession(sessionId, user.id, { ...clientInfo(req), ttlDays: SESSION_TTL_DAYS });
  audit('login', 'user', user.id, `用户登录（会话 ${sessionId.slice(0, 8)}）`);
  return { user: publicUser(user), sessionId };
}

function assertPassword(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
    err.status = 400;
    throw err;
  }
  return value;
}

// 普通用户注册：固定为 editor，不可自助成为数据管理员。
export function registerUser({ name, email, password }, req) {
  const displayName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!displayName) {
    const err = new Error('请输入昵称');
    err.status = 400;
    throw err;
  }
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    const err = new Error('请输入有效邮箱');
    err.status = 400;
    throw err;
  }
  const passwordValue = assertPassword(password);
  if (getUserByEmail(normalizedEmail)) {
    const err = new Error('该邮箱已注册');
    err.status = 409;
    throw err;
  }
  const user = createRegisteredUser({
    name: displayName,
    email: normalizedEmail,
    passwordHash: hashPassword(passwordValue),
  });
  return issueSession(user, req);
}

export function loginWithEmail(email, password, req) {
  const normalized = String(email || '').trim();
  if (!normalized) {
    const err = new Error('请输入邮箱');
    err.status = 400;
    throw err;
  }
  const user = getUserByEmail(normalized);
  if (!user) {
    const err = new Error('邮箱或密码不正确');
    err.status = 401;
    throw err;
  }
  if (user.status === 'disabled') {
    const err = new Error('该账号已停用');
    err.status = 403;
    throw err;
  }
  if (!user.password_hash) {
    const err = new Error('该账号尚未设置密码，请联系数据管理员');
    err.status = 403;
    throw err;
  }
  if (!verifyPassword(password, user.password_hash)) {
    const err = new Error('邮箱或密码不正确');
    err.status = 401;
    throw err;
  }
  return issueSession(user, req);
}

export function updateProfile(userId, { name }) {
  const displayName = String(name || '').trim().slice(0, 60);
  if (!displayName) {
    const err = new Error('请输入昵称');
    err.status = 400;
    throw err;
  }
  db.prepare('UPDATE users SET name = ?, display_name = ?, last_seen = ? WHERE id = ?')
    .run(displayName, displayName, now(), userId);
  audit('update', 'user', userId, `更新昵称为 ${displayName}`);
  return publicUser(getUserById(userId));
}

export function changePassword(userId, { currentPassword, newPassword }) {
  const user = getUserById(userId);
  if (!user) {
    const err = new Error('用户不存在');
    err.status = 404;
    throw err;
  }
  if (user.password_hash && !verifyPassword(currentPassword, user.password_hash)) {
    const err = new Error('当前密码不正确');
    err.status = 401;
    throw err;
  }
  if (!user.password_hash && String(currentPassword || '')) {
    const err = new Error('当前密码不正确');
    err.status = 401;
    throw err;
  }
  const next = assertPassword(newPassword);
  if (user.password_hash && verifyPassword(next, user.password_hash)) {
    const err = new Error('新密码不能与当前密码相同');
    err.status = 400;
    throw err;
  }
  db.prepare('UPDATE users SET password_hash = ?, last_seen = ? WHERE id = ?')
    .run(hashPassword(next), now(), userId);
  audit('update', 'user', userId, '修改登录密码');
  return { ok: true };
}

export function logoutSession(sessionId) {
  deleteSession(sessionId);
}

export function revokeAllSessions(userId) {
  deleteSessionsByUser(userId);
  audit('logout', 'user', userId, '强制下线全部会话');
}

export function mySessions(userId) {
  return listSessionsByUser(userId);
}

function id(value) {
  return Number.parseInt(value, 10);
}
