import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
mkdirSync(dataDir, { recursive: true });

export const dbPath = process.env.DB_PATH || path.join(dataDir, 'open-my-map.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '地图管理员',
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'link', 'public')),
    base_map TEXT NOT NULL DEFAULT 'standard',
    center_lat REAL NOT NULL DEFAULT 31.2304,
    center_lng REAL NOT NULL DEFAULT 121.4737,
    zoom INTEGER NOT NULL DEFAULT 12,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    style_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layer_id INTEGER NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('Point', 'LineString', 'Polygon')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    geometry_json TEXT NOT NULL,
    style_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT NOT NULL DEFAULT '',
    wx_unionid TEXT,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );

  -- 微信登录账号绑定。一个本地用户可绑定多个微信主体（开放平台扫码、公众号网页授权）。
  CREATE TABLE IF NOT EXISTS wechat_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    openid TEXT NOT NULL,
    unionid TEXT,
    platform TEXT NOT NULL DEFAULT 'open' CHECK (platform IN ('open', 'mp')),
    nickname TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    UNIQUE(platform, openid)
  );

  -- 登录会话。token 通过 Authorization: Bearer 携带。
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    access TEXT NOT NULL DEFAULT 'view' CHECK (access IN ('view', 'edit')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS import_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    layer_id INTEGER REFERENCES layers(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    format TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_layers_map_id ON layers(map_id);
  CREATE INDEX IF NOT EXISTS idx_features_layer_id ON features(layer_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_feature_id ON attachments(feature_id);
  CREATE INDEX IF NOT EXISTS idx_imports_map_id ON import_jobs(map_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_wechat_unionid ON wechat_accounts(unionid);
  CREATE INDEX IF NOT EXISTS idx_wechat_user_id ON wechat_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`);

// 旧库迁移：为 users 补充新列（CREATE TABLE IF NOT EXISTS 不会改动已存在的表）。
const userColumns = db.prepare('PRAGMA table_info(users)').all();
const addUserColumn = (name, def) => {
  if (!userColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
  }
};
addUserColumn('display_name', "TEXT NOT NULL DEFAULT ''");
addUserColumn('avatar_url', "TEXT NOT NULL DEFAULT ''");
addUserColumn('wx_unionid', 'TEXT');
addUserColumn('password_hash', 'TEXT');

const mapColumns = db.prepare('PRAGMA table_info(maps)').all();
if (!mapColumns.some((column) => column.name === 'project_id')) {
  db.exec('ALTER TABLE maps ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');
}
if (!mapColumns.some((column) => column.name === 'created_by_user_id')) {
  db.exec('ALTER TABLE maps ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_maps_project_id ON maps(project_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_maps_created_by ON maps(created_by_user_id)');

function ensureVersionColumn(table) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === 'version')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
  }
}
ensureVersionColumn('maps');
ensureVersionColumn('layers');
ensureVersionColumn('features');

// 全局账户仅保留 admin / editor；历史 viewer 迁移为普通用户。
db.prepare("UPDATE users SET role = 'editor' WHERE role = 'viewer'").run();

const iso = () => new Date().toISOString();
const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
};

// 演示账号初始密码哈希（admin123）。正式环境应由管理员自行修改。
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [algo, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function audit(action, entityType, entityId, details = '') {
  db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(action, entityType, String(entityId), details, iso());
}

function seed() {
  const mapCount = Number(db.prepare('SELECT COUNT(*) AS count FROM maps').get().count);
  if (mapCount > 0) return;

  const created = iso();
  const mapResult = db.prepare(`
    INSERT INTO maps (name, description, owner, visibility, base_map, center_lat, center_lng, zoom, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('上海周末地图', '收藏适合周末散步、拍照与喝咖啡的地点。', '地图管理员', 'link', 'standard', 31.2378, 121.4923, 13, created, created);
  const mapId = Number(mapResult.lastInsertRowid);

  const layerInsert = db.prepare(`
    INSERT INTO layers (map_id, name, visible, position, style_json, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?)
  `);
  const placesId = Number(layerInsert.run(mapId, '周末地点', 0, JSON.stringify({ color: '#1a73e8' }), created, created).lastInsertRowid);
  const routesId = Number(layerInsert.run(mapId, '散步路线与区域', 1, JSON.stringify({ color: '#00897b' }), created, created).lastInsertRowid);

  const featureInsert = db.prepare(`
    INSERT INTO features (layer_id, type, name, description, geometry_json, style_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const features = [
    [placesId, 'Point', '外滩观景平台', '傍晚看浦江与陆家嘴灯光。', { type: 'Point', coordinates: [121.4906, 31.2403] }, { color: '#1a73e8', icon: 'camera' }],
    [placesId, 'Point', '武康大楼', '城市漫步与建筑摄影地标。', { type: 'Point', coordinates: [121.4388, 31.2078] }, { color: '#8e24aa', icon: 'place' }],
    [placesId, 'Point', '新天地', '石库门街区、餐厅与咖啡馆。', { type: 'Point', coordinates: [121.4752, 31.2190] }, { color: '#f4511e', icon: 'food' }],
    [placesId, 'Point', '苏州河梦清园', '适合骑行与河畔散步。', { type: 'Point', coordinates: [121.4537, 31.2528] }, { color: '#00897b', icon: 'park' }],
    [routesId, 'LineString', '外滩滨江散步线', '从外白渡桥沿中山东一路向南。', { type: 'LineString', coordinates: [[121.4893, 31.2493], [121.4903, 31.2449], [121.4906, 31.2403], [121.4915, 31.2358], [121.4932, 31.2295]] }, { color: '#e85d4a', weight: 5 }],
    [routesId, 'Polygon', '北外滩周末活动区', '滨江公共空间与活动范围。', { type: 'Polygon', coordinates: [[[121.4933, 31.2528], [121.5016, 31.2510], [121.5055, 31.2456], [121.4990, 31.2421], [121.4933, 31.2528]]] }, { color: '#009688', fillColor: '#4db6ac', fillOpacity: 0.28, weight: 3 }],
  ];
  for (const feature of features) {
    featureInsert.run(feature[0], feature[1], feature[2], feature[3], JSON.stringify(feature[4]), JSON.stringify(feature[5]), created, created);
  }

  const demoHash = hashPassword('admin123');
  const userInsert = db.prepare(`
    INSERT INTO users (name, display_name, email, role, status, password_hash, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  userInsert.run('地图管理员', '地图管理员', 'admin@openmymap.local', 'admin', 'active', demoHash, created, created);
  userInsert.run('内容编辑', '内容编辑', 'editor@openmymap.local', 'editor', 'active', demoHash, created, created);

  db.prepare(`
    INSERT INTO import_jobs (map_id, layer_id, file_name, format, row_count, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(mapId, placesId, 'shanghai-weekend.csv', 'CSV', 4, 'completed', created);

  audit('seed', 'database', 'initial', '创建演示地图、图层、要素与用户');
}

seed();

// 已有库若缺少演示账号密码，补上 admin123，便于本地登录。
function ensureDemoPasswords() {
  const rows = db.prepare(`
    SELECT id FROM users
    WHERE email IN ('admin@openmymap.local', 'editor@openmymap.local')
      AND (password_hash IS NULL OR password_hash = '')
  `).all();
  if (!rows.length) return;
  const hash = hashPassword('admin123');
  const update = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  for (const row of rows) update.run(hash, row.id);
}
ensureDemoPasswords();

function ensureProjects() {
  const created = iso();
  let project = db.prepare('SELECT * FROM projects ORDER BY id LIMIT 1').get();
  const owner = db.prepare("SELECT * FROM users ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, id LIMIT 1").get();

  if (!project) {
    const firstMap = db.prepare('SELECT name FROM maps ORDER BY id LIMIT 1').get();
    const projectName = firstMap?.name
      ? `${String(firstMap.name).replace(/地图$/, '') || firstMap.name}项目`
      : '默认项目';
    const result = db.prepare(`
      INSERT INTO projects (name, description, owner_user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(projectName, '由现有地图自动建立的项目空间。', owner?.id || null, created, created);
    project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(result.lastInsertRowid));
  }

  db.prepare('UPDATE maps SET project_id = ? WHERE project_id IS NULL').run(project.id);
  if (project.owner_user_id) {
    db.prepare(`
      INSERT OR IGNORE INTO project_members (project_id, user_id, role, created_at)
      VALUES (?, ?, 'owner', ?)
    `).run(project.id, project.owner_user_id, created);
  }
}

ensureProjects();

export function listMaps() {
  return db.prepare(`
    SELECT m.*, p.name AS project_name,
      (SELECT COUNT(*) FROM layers l WHERE l.map_id = m.id) AS layer_count,
      (SELECT COUNT(*) FROM features f JOIN layers l ON l.id = f.layer_id WHERE l.map_id = m.id) AS feature_count
    FROM maps m
    LEFT JOIN projects p ON p.id = m.project_id
    ORDER BY m.updated_at DESC
  `).all();
}

export function getMap(id) {
  const map = db.prepare(`
    SELECT m.*, p.name AS project_name
    FROM maps m LEFT JOIN projects p ON p.id = m.project_id
    WHERE m.id = ?
  `).get(id);
  if (!map) return null;
  const layers = db.prepare('SELECT * FROM layers WHERE map_id = ? ORDER BY position, id').all(id);
  const featureStmt = db.prepare('SELECT * FROM features WHERE layer_id = ? ORDER BY id');
  const attachmentRows = db.prepare(`
    SELECT a.* FROM attachments a
    JOIN features f ON f.id = a.feature_id
    JOIN layers l ON l.id = f.layer_id
    WHERE l.map_id = ?
    ORDER BY a.id
  `).all(id);
  const attachmentsByFeature = new Map();
  for (const attachment of attachmentRows) {
    const serialized = {
      id: attachment.id,
      feature_id: attachment.feature_id,
      kind: attachment.kind,
      original_name: attachment.original_name,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
      created_at: attachment.created_at,
      url: `/uploads/${encodeURIComponent(attachment.stored_name)}`,
    };
    const current = attachmentsByFeature.get(attachment.feature_id) || [];
    current.push(serialized);
    attachmentsByFeature.set(attachment.feature_id, current);
  }
  map.layers = layers.map((layer) => ({
    ...layer,
    visible: Boolean(layer.visible),
    style: parseJson(layer.style_json),
    features: featureStmt.all(layer.id).map((feature) => ({
      ...feature,
      geometry: parseJson(feature.geometry_json),
      style: parseJson(feature.style_json),
      attachments: attachmentsByFeature.get(feature.id) || [],
    })),
  }));
  return map;
}

export function getPublicMap(token) {
  const share = db.prepare('SELECT * FROM shares WHERE token = ?').get(token);
  if (!share) return null;
  const map = getMap(share.map_id);
  return map ? { ...map, shareAccess: share.access, shareToken: token } : null;
}

export function adminStats() {
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const byType = db.prepare('SELECT type, COUNT(*) AS count FROM features GROUP BY type').all();
  const byVisibility = db.prepare('SELECT visibility, COUNT(*) AS count FROM maps GROUP BY visibility').all();
  return {
    maps: count('maps'),
    layers: count('layers'),
    features: count('features'),
    attachments: count('attachments'),
    users: count('users'),
    projects: count('projects'),
    imports: count('import_jobs'),
    shares: count('shares'),
    byType,
    byVisibility,
    dbPath,
  };
}

export function listProjects() {
  return db.prepare(`
    SELECT p.id, p.name, p.description, p.owner_user_id, p.status, p.created_at,
      COALESCE((SELECT MAX(m.updated_at) FROM maps m WHERE m.project_id = p.id), p.updated_at) AS updated_at,
      u.name AS owner_name, u.email AS owner_email,
      (SELECT COUNT(*) FROM maps m WHERE m.project_id = p.id) AS map_count,
      (SELECT COUNT(*) FROM layers l JOIN maps m ON m.id = l.map_id WHERE m.project_id = p.id) AS layer_count,
      (SELECT COUNT(*) FROM features f JOIN layers l ON l.id = f.layer_id JOIN maps m ON m.id = l.map_id WHERE m.project_id = p.id) AS feature_count,
      (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count
    FROM projects p
    LEFT JOIN users u ON u.id = p.owner_user_id
    ORDER BY p.updated_at DESC, p.id DESC
  `).all();
}

export function listLibraryProjects() {
  return listProjects()
    .filter((project) => project.status === 'active')
    .map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      created_at: project.created_at,
      updated_at: project.updated_at,
      owner_name: project.owner_name,
      map_count: project.map_count,
      layer_count: project.layer_count,
      feature_count: project.feature_count,
      member_count: project.member_count,
    }));
}

export function backupData() {
  const tables = ['projects', 'project_members', 'maps', 'layers', 'features', 'attachments', 'users', 'wechat_accounts', 'sessions', 'shares', 'import_jobs', 'audit_logs'];
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
}

// —— 会话 ——
export function createSession(id, userId, { ip = '', userAgent = '', ttlDays = 30 } = {}) {
  const created = iso();
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, created, expiresAt, created, ip, userAgent);
  return { id, userId, createdAt: created, expiresAt };
}

export function getSessionRow(id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  if (row.expires_at < iso()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  return row;
}

export function touchSession(id) {
  if (!id) return;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(iso(), id);
}

export function deleteSession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id || '');
}

export function deleteSessionsByUser(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function listSessionsByUser(userId) {
  return db.prepare(`
    SELECT id, user_agent, ip, created_at, last_seen_at, expires_at
    FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC
  `).all(userId);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name || row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
    lastSeen: row.last_seen,
  };
}

export function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email || ''));
}

export function createRegisteredUser({ name, email, passwordHash }) {
  const created = iso();
  const displayName = String(name || '').trim().slice(0, 60) || '用户';
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const result = db.prepare(`
    INSERT INTO users (name, display_name, email, role, status, password_hash, created_at, last_seen)
    VALUES (?, ?, ?, 'editor', 'active', ?, ?, ?)
  `).run(displayName, displayName, normalizedEmail, passwordHash, created, created);
  const userId = Number(result.lastInsertRowid);
  audit('register', 'user', userId, `普通用户注册 ${normalizedEmail}`);
  return getUserById(userId);
}

export function createProjectOwnedBy(user, { name, description = '' }) {
  const created = iso();
  const projectName = String(name || '').trim().slice(0, 120) || '未命名项目';
  const result = db.prepare(`
    INSERT INTO projects (name, description, owner_user_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(projectName, String(description || ''), user.id, created, created);
  const projectId = Number(result.lastInsertRowid);
  db.prepare(`
    INSERT INTO project_members (project_id, user_id, role, created_at)
    VALUES (?, ?, 'owner', ?)
  `).run(projectId, user.id, created);
  audit('create', 'project', projectId, `用户 ${user.email || user.id} 创建项目“${projectName}”`);
  return listProjects().find((project) => project.id === projectId);
}

function assertProjectOwner(projectId, actor) {
  const membership = membershipForProject(actor.id, projectId);
  const allowed = actor.role === 'admin' || membership?.role === 'owner';
  if (!allowed) {
    const err = new Error('仅项目所有者可管理成员');
    err.status = 403;
    throw err;
  }
}

function countOwners(projectId) {
  return Number(db.prepare("SELECT COUNT(*) AS count FROM project_members WHERE project_id = ? AND role = 'owner'").get(projectId).count);
}

export function listProjectMembers(projectId, actor) {
  if (!canAccessProject(actor, projectId)) {
    const err = new Error('无权查看该项目成员');
    err.status = 403;
    throw err;
  }
  return db.prepare(`
    SELECT pm.project_id AS projectId, pm.user_id AS userId, pm.role, pm.created_at AS createdAt,
      u.email, COALESCE(NULLIF(u.display_name, ''), u.name) AS name, u.avatar_url AS avatarUrl
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, pm.created_at, u.id
  `).all(projectId);
}

export function inviteProjectMember(projectId, { email, role = 'editor', actor }) {
  assertProjectOwner(projectId, actor);
  const invitee = getUserByEmail(email);
  if (!invitee) {
    const err = new Error('该邮箱用户不存在，请对方先注册');
    err.status = 404;
    throw err;
  }
  if (invitee.id === actor.id && actor.role !== 'admin') {
    const err = new Error('不能邀请自己');
    err.status = 400;
    throw err;
  }
  const memberRole = role === 'viewer' ? 'viewer' : 'editor';
  db.prepare(`
    INSERT INTO project_members (project_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role
  `).run(projectId, invitee.id, memberRole, iso());
  audit('invite', 'project', projectId, `邀请 ${invitee.email} 为 ${memberRole}`);
  return {
    projectId,
    userId: invitee.id,
    email: invitee.email,
    name: invitee.display_name || invitee.name,
    role: memberRole,
  };
}

export function updateProjectMemberRole(projectId, userId, role, actor) {
  assertProjectOwner(projectId, actor);
  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  if (!member) {
    const err = new Error('成员不存在');
    err.status = 404;
    throw err;
  }
  const nextRole = role === 'viewer' ? 'viewer' : role === 'owner' ? 'owner' : 'editor';
  if (member.role === 'owner' && nextRole !== 'owner' && countOwners(projectId) <= 1) {
    const err = new Error('不能降级唯一所有者，请先转让所有权');
    err.status = 409;
    throw err;
  }
  db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?').run(nextRole, projectId, userId);
  if (nextRole === 'owner') {
    db.prepare('UPDATE projects SET owner_user_id = ?, updated_at = ? WHERE id = ?').run(userId, iso(), projectId);
  }
  audit('update', 'project_member', `${projectId}:${userId}`, `role=${nextRole}`);
  return listProjectMembers(projectId, actor).find((row) => row.userId === userId);
}

export function removeProjectMember(projectId, userId, actor) {
  assertProjectOwner(projectId, actor);
  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  if (!member) {
    const err = new Error('成员不存在');
    err.status = 404;
    throw err;
  }
  if (member.role === 'owner' && countOwners(projectId) <= 1) {
    const err = new Error('不能移除唯一所有者，请先转让所有权');
    err.status = 409;
    throw err;
  }
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, userId);
  audit('remove', 'project_member', `${projectId}:${userId}`, '移除项目成员');
  return { ok: true };
}

export function transferProjectOwnership(projectId, toUserId, actor) {
  assertProjectOwner(projectId, actor);
  const target = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, toUserId);
  if (!target) {
    const err = new Error('目标用户不是项目成员');
    err.status = 404;
    throw err;
  }
  const created = iso();
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE project_members SET role = 'editor' WHERE project_id = ? AND role = 'owner'").run(projectId);
    db.prepare(`
      INSERT INTO project_members (project_id, user_id, role, created_at)
      VALUES (?, ?, 'owner', ?)
      ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner'
    `).run(projectId, toUserId, created);
    db.prepare('UPDATE projects SET owner_user_id = ?, updated_at = ? WHERE id = ?').run(toUserId, created, projectId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit('transfer', 'project', projectId, `所有权转让给用户 ${toUserId}`);
  return listProjectMembers(projectId, actor);
}

// —— 微信登录 ——
export function findWechatAccount({ platform, openid, unionid }) {
  if (unionid) {
    const byUnion = db.prepare('SELECT * FROM wechat_accounts WHERE unionid = ?').get(unionid);
    if (byUnion) return byUnion;
  }
  return db.prepare('SELECT * FROM wechat_accounts WHERE platform = ? AND openid = ?').get(platform, openid);
}

// 首位注册用户自动成为数据管理员（bootstrap）。
export function findOrCreateWechatUser({ platform, openid, unionid, nickname, avatar }) {
  const existing = findWechatAccount({ platform, openid, unionid });
  if (existing) {
    db.prepare(`
      UPDATE wechat_accounts
      SET last_login_at = ?, nickname = COALESCE(NULLIF(?, ''), nickname), avatar_url = COALESCE(NULLIF(?, ''), avatar_url)
      WHERE id = ?
    `).run(iso(), nickname || '', avatar || '', existing.id);
    if (avatar) db.prepare('UPDATE users SET avatar_url = ? WHERE id = ? AND avatar_url = ?').run(avatar, existing.user_id, '');
    return getUserById(existing.user_id);
  }
  const created = iso();
  const displayName = (nickname || '微信用户').slice(0, 60);
  const email = `${platform}_${openid}@wx.local`;
  const userResult = db.prepare(`
    INSERT INTO users (name, display_name, email, role, status, avatar_url, created_at, last_seen)
    VALUES (?, ?, ?, 'editor', 'active', ?, ?, ?)
  `).run(displayName, displayName, email, avatar || '', created, created);
  const userId = Number(userResult.lastInsertRowid);
  db.prepare(`
    INSERT INTO wechat_accounts (user_id, openid, unionid, platform, nickname, avatar_url, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, openid, unionid || '', platform, nickname || '', avatar || '', created, created);
  const adminCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count);
  if (adminCount === 0) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
    audit('bootstrap', 'user', userId, '首位微信登录用户自动设为数据管理员');
  } else {
    audit('register', 'user', userId, `微信用户注册（${platform}）`);
  }
  return getUserById(userId);
}

// —— 项目成员权限 ——
export function membershipForMap(userId, mapId) {
  return db.prepare(`
    SELECT pm.role FROM project_members pm
    JOIN maps m ON m.project_id = pm.project_id
    WHERE m.id = ? AND pm.user_id = ?
  `).get(mapId, userId) || null;
}

export function membershipForProject(userId, projectId) {
  return db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId) || null;
}

export function canEditMap(user, mapId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const membership = membershipForMap(user.id, mapId);
  return membership?.role === 'owner' || membership?.role === 'editor';
}

export function canViewMap(user, mapId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(membershipForMap(user.id, mapId));
}

export function canEditProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const membership = membershipForProject(user.id, projectId);
  return membership?.role === 'owner';
}

export function canAccessProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(membershipForProject(user.id, projectId));
}

// —— 可见性过滤 ——
export function listVisibleProjects(user) {
  const all = listProjects();
  if (!user) return [];
  if (user.role === 'admin') {
    return all.map((project) => ({ ...project, my_role: 'admin' }));
  }
  const memberRows = db.prepare('SELECT project_id, role FROM project_members WHERE user_id = ?').all(user.id);
  const roleByProject = new Map(memberRows.map((row) => [row.project_id, row.role]));
  return all
    .filter((project) => roleByProject.has(project.id))
    .map((project) => ({ ...project, my_role: roleByProject.get(project.id) }));
}

export function listVisibleMaps(user) {
  if (!user) return [];
  if (user.role === 'admin') {
    return listMaps().map((map) => ({
      ...map,
      my_role: 'admin',
      is_owner: true,
    }));
  }
  const rows = db.prepare(`
    SELECT m.*, p.name AS project_name, p.owner_user_id,
      pm.role AS my_role,
      (SELECT COUNT(*) FROM layers l WHERE l.map_id = m.id) AS layer_count,
      (SELECT COUNT(*) FROM features f JOIN layers l ON l.id = f.layer_id WHERE l.map_id = m.id) AS feature_count
    FROM maps m
    LEFT JOIN projects p ON p.id = m.project_id
    JOIN project_members pm ON pm.project_id = m.project_id AND pm.user_id = ?
    ORDER BY m.updated_at DESC
  `).all(user.id);
  return rows.map((map) => ({
    ...map,
    is_owner: map.owner_user_id === user.id || map.my_role === 'owner',
  }));
}

export function normalizeGlobalRole(role) {
  return role === 'admin' ? 'admin' : 'editor';
}

export const now = iso;
