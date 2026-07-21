import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import http from 'node:http';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import {
  db, getMap, getPublicMap, listMaps, listProjects, adminStats, backupData, audit, now,
  listVisibleMaps, listVisibleProjects, createProjectOwnedBy, inviteProjectMember,
  listProjectMembers, updateProjectMemberRole, removeProjectMember, transferProjectOwnership,
  hashPassword, normalizeGlobalRole,
} from './db.js';
import {
  loadSession, loginWithEmail, logoutSession, registerUser, updateProfile, changePassword,
  mySessions, requireUser, revokeAllSessions,
} from './auth.js';
import { attachRealtime, broadcastMapOp, createMapOp } from './realtime.js';

const app = express();
const port = Number(process.env.PORT || 4173);
const ADMIN_KEY = process.env.OPEN_MY_MAP_ADMIN_KEY || 'omm-admin-2026';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const uploadsDir = process.env.UPLOAD_DIR || path.resolve(here, '../data/uploads');
const uploadTempDir = process.env.UPLOAD_TEMP_DIR || path.resolve(here, '../data/.upload-tmp');
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_FEATURE = 12;
const MAX_FILES_PER_UPLOAD = 8;
const supportedMediaTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
]);
const invalidFileNameCharacters = new Set('<>:"/\\|?*');

mkdirSync(uploadsDir, { recursive: true });
mkdirSync(uploadTempDir, { recursive: true });

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '12mb' }));
// 所有请求注入当前会话/用户。
app.use(loadSession);
app.use('/uploads', express.static(uploadsDir, {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));
app.use('/uploads', (req, res) => res.status(404).json({ error: '媒体文件不存在' }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const id = (value) => Number.parseInt(value, 10);
const notFound = (res, message = '未找到对应数据') => res.status(404).json({ error: message });

const mediaUpload = multer({
  dest: uploadTempDir,
  limits: { files: MAX_FILES_PER_UPLOAD, fileSize: MAX_VIDEO_BYTES },
  fileFilter: (req, file, done) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/octet-stream') return done(null, true);
    const error = new Error('仅支持图片或视频文件');
    error.status = 415;
    return done(error);
  },
});

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readExpectedVersion(req) {
  if (Object.hasOwn(req.body || {}, 'expectedVersion')) {
    const value = Number(req.body.expectedVersion);
    return Number.isFinite(value) ? value : null;
  }
  const header = req.get('if-match');
  if (header == null || header === '') return null;
  const value = Number(header);
  return Number.isFinite(value) ? value : null;
}

function assertVersionMatch(req, res, currentVersion, latestPayload) {
  const expected = readExpectedVersion(req);
  if (expected == null) return true;
  if (Number(currentVersion) === expected) return true;
  res.status(409).json({
    error: '内容已被他人更新，请基于最新版本继续编辑',
    conflict: true,
    expectedVersion: expected,
    currentVersion: Number(currentVersion),
    latest: latestPayload,
  });
  return false;
}

function findFeatureInMap(map, featureId) {
  for (const layer of map?.layers || []) {
    const feature = (layer.features || []).find((item) => item.id === featureId);
    if (feature) return { ...feature, layerId: layer.id };
  }
  return null;
}

function findLayerInMap(map, layerId) {
  return (map?.layers || []).find((layer) => layer.id === layerId) || null;
}

function emitMapOp(mapId, action, actor, { entity = null, entityId = null, version = null } = {}) {
  broadcastMapOp(mapId, createMapOp({ action, actor, entity, entityId, version }));
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Unable to remove media file ${filePath}: ${error.message}`);
  }
}

function cleanupTemporaryFiles(files = []) {
  for (const file of files) {
    if (file?.path) safeUnlink(file.path);
  }
}

function deleteStoredFiles(attachments = []) {
  for (const attachment of attachments) {
    if (attachment?.stored_name) safeUnlink(path.join(uploadsDir, attachment.stored_name));
  }
}

function cleanOriginalName(value) {
  const originalName = path.basename(String(value || 'media'));
  const cleaned = Array.from(originalName, (character) => character.charCodeAt(0) < 32 || invalidFileNameCharacters.has(character) ? '_' : character).join('');
  return cleaned.slice(0, 180) || 'media';
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'open-my-map', time: now() }));

// —— 鉴权 ——
app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));

app.patch('/api/auth/me', requireUser, (req, res) => {
  try {
    const user = updateProfile(req.user.id, { name: req.body.name });
    res.json({ user });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/auth/password', requireUser, (req, res) => {
  try {
    changePassword(req.user.id, {
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  try {
    const { user, sessionId } = registerUser({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
    }, req);
    res.status(201).json({ user, sessionId });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  try {
    const { user, sessionId } = loginWithEmail(String(req.body.email || ''), req.body.password, req);
    res.json({ user, sessionId });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
}));

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionId) logoutSession(req.sessionId);
  res.json({ ok: true });
});

app.get('/api/auth/sessions', requireUser, (req, res) => res.json(mySessions(req.user.id)));

app.delete('/api/auth/sessions', requireUser, (req, res) => {
  revokeAllSessions(req.user.id);
  res.json({ ok: true });
});

app.get('/api/maps', requireUser, (req, res) => res.json(listVisibleMaps(req.user)));
app.get('/api/projects', requireUser, (req, res) => res.json(listVisibleProjects(req.user)));

app.post('/api/projects', requireUser, (req, res) => {
  const project = createProjectOwnedBy(req.user, {
    name: req.body.name,
    description: req.body.description,
  });
  res.status(201).json(project);
});

app.post('/api/projects/:projectId/members', requireUser, (req, res) => {
  try {
    const member = inviteProjectMember(id(req.params.projectId), {
      email: req.body.email,
      role: req.body.role,
      actor: req.user,
    });
    res.status(201).json(member);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get('/api/projects/:projectId/members', requireUser, (req, res) => {
  try {
    res.json(listProjectMembers(id(req.params.projectId), req.user));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.patch('/api/projects/:projectId/members/:userId', requireUser, (req, res) => {
  try {
    const member = updateProjectMemberRole(
      id(req.params.projectId),
      id(req.params.userId),
      req.body.role,
      req.user,
    );
    res.json(member);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.delete('/api/projects/:projectId/members/:userId', requireUser, (req, res) => {
  try {
    removeProjectMember(id(req.params.projectId), id(req.params.userId), req.user);
    res.status(204).end();
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/projects/:projectId/transfer', requireUser, (req, res) => {
  try {
    const members = transferProjectOwnership(
      id(req.params.projectId),
      id(req.body.userId ?? req.body.toUserId),
      req.user,
    );
    res.json(members);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/maps', requireUser, (req, res) => {
  const created = now();
  const name = String(req.body.name || '无标题地图').trim().slice(0, 120) || '无标题地图';
  // 选择目标项目：优先指定，否则取用户可编辑的第一个项目。
  let projectId;
  const requestedProjectId = id(req.body.projectId ?? req.body.project_id);
  if (requestedProjectId) {
    const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(requestedProjectId, req.user.id);
    if (!membership && req.user.role !== 'admin') return res.status(403).json({ error: '无权在该项目创建地图' });
    projectId = requestedProjectId;
  } else {
    const candidates = listVisibleProjects(req.user);
    const editable = req.user.role === 'admin'
      ? candidates
      : candidates.filter((p) => {
        const row = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(p.id, req.user.id);
        return row?.role === 'owner' || row?.role === 'editor';
      });
    projectId = editable[0]?.id || candidates[0]?.id || null;
  }
  if (!projectId) return res.status(400).json({ error: '当前账号没有可创建地图的项目，请联系项目负责人或数据管理员' });
  const result = db.prepare(`
    INSERT INTO maps (name, description, owner, visibility, base_map, center_lat, center_lng, zoom, created_at, updated_at, project_id, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, String(req.body.description || ''), req.user.displayName || req.user.name, 'private', 'standard', 31.2304, 121.4737, 11, created, created, projectId, req.user.id);
  const mapId = Number(result.lastInsertRowid);
  const layerResult = db.prepare(`
    INSERT INTO layers (map_id, name, visible, position, style_json, created_at, updated_at)
    VALUES (?, '无标题图层', 1, 0, ?, ?, ?)
  `).run(mapId, JSON.stringify({ color: '#1a73e8' }), created, created);
  audit('create', 'map', mapId, `创建地图“${name}”，默认图层 ${Number(layerResult.lastInsertRowid)}`);
  res.status(201).json(getMap(mapId));
});

app.get('/api/maps/:mapId', (req, res) => {
  const mapId = id(req.params.mapId);
  const map = getMap(mapId);
  if (!map) return notFound(res, '地图不存在');
  // 公开链接访问由 /api/public/:token 承担；此处需登录且具备查看权限。
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (req.user.role !== 'admin') {
    const membership = db.prepare(`
      SELECT role FROM project_members pm
      JOIN maps m ON m.project_id = pm.project_id
      WHERE m.id = ? AND pm.user_id = ?
    `).get(mapId, req.user.id);
    if (!membership) return res.status(403).json({ error: '无权查看该地图' });
  }
  res.json(map);
});

// 校验当前用户对某地图是否具备编辑权限（owner/editor 或 data_admin）。
// 通过返回 true；失败时已写入 401/403 响应并返回 false。
function assertEditor(req, res, mapId) {
  if (!req.user) { res.status(401).json({ error: '请先登录' }); return false; }
  if (req.user.role === 'admin') return true;
  const membership = db.prepare(`
    SELECT role FROM project_members pm
    JOIN maps m ON m.project_id = pm.project_id
    WHERE m.id = ? AND pm.user_id = ?
  `).get(mapId, req.user.id);
  if (membership?.role === 'owner' || membership?.role === 'editor') return true;
  res.status(403).json({ error: '无权修改该地图' });
  return false;
}

app.patch('/api/maps/:mapId', (req, res) => {
  const mapId = id(req.params.mapId);
  const existing = getMap(mapId);
  if (!existing) return notFound(res, '地图不存在');
  if (!assertEditor(req, res, mapId)) return;
  if (!assertVersionMatch(req, res, existing.version, existing)) return;
  const allowed = ['name', 'description', 'owner', 'visibility', 'base_map', 'center_lat', 'center_lng', 'zoom'];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (Object.hasOwn(req.body, key)) {
      fields.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }
  if (fields.length) {
    fields.push('version = version + 1', 'updated_at = ?');
    values.push(now(), mapId);
    db.prepare(`UPDATE maps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    audit('update', 'map', mapId, `更新字段：${fields.slice(0, -2).join(', ')}`);
  }
  const map = getMap(mapId);
  emitMapOp(mapId, 'map.updated', req.user, { entity: map, version: map.version });
  res.json(map);
});

app.delete('/api/maps/:mapId', (req, res) => {
  const mapId = id(req.params.mapId);
  const existing = db.prepare('SELECT name FROM maps WHERE id = ?').get(mapId);
  if (!existing) return notFound(res, '地图不存在');
  if (!assertEditor(req, res, mapId)) return;
  const attachments = db.prepare(`
    SELECT a.stored_name FROM attachments a
    JOIN features f ON f.id = a.feature_id
    JOIN layers l ON l.id = f.layer_id
    WHERE l.map_id = ?
  `).all(mapId);
  db.prepare('DELETE FROM maps WHERE id = ?').run(mapId);
  deleteStoredFiles(attachments);
  audit('delete', 'map', mapId, `删除地图“${existing.name}”`);
  emitMapOp(mapId, 'map.deleted', req.user, { entityId: mapId });
  res.status(204).end();
});

app.post('/api/maps/:mapId/layers', (req, res) => {
  const mapId = id(req.params.mapId);
  if (!db.prepare('SELECT 1 FROM maps WHERE id = ?').get(mapId)) return notFound(res, '地图不存在');
  if (!assertEditor(req, res, mapId)) return;
  const created = now();
  const position = Number(db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM layers WHERE map_id = ?').get(mapId).position);
  const name = String(req.body.name || '无标题图层').trim().slice(0, 120) || '无标题图层';
  const result = db.prepare(`
    INSERT INTO layers (map_id, name, visible, position, style_json, created_at, updated_at, version)
    VALUES (?, ?, 1, ?, ?, ?, ?, 1)
  `).run(mapId, name, position, JSON.stringify(req.body.style || { color: '#1a73e8' }), created, created);
  db.prepare('UPDATE maps SET updated_at = ?, version = version + 1 WHERE id = ?').run(created, mapId);
  audit('create', 'layer', result.lastInsertRowid, `添加到地图 ${mapId}`);
  const map = getMap(mapId);
  const layer = findLayerInMap(map, Number(result.lastInsertRowid));
  emitMapOp(mapId, 'layer.created', req.user, { entity: layer, version: layer?.version });
  res.status(201).json(map);
});

app.patch('/api/layers/:layerId', (req, res) => {
  const layerId = id(req.params.layerId);
  const layer = db.prepare('SELECT * FROM layers WHERE id = ?').get(layerId);
  if (!layer) return notFound(res, '图层不存在');
  if (!assertEditor(req, res, layer.map_id)) return;
  const latestMap = getMap(layer.map_id);
  if (!assertVersionMatch(req, res, layer.version, findLayerInMap(latestMap, layerId))) return;
  const fields = [];
  const values = [];
  const keyMap = { name: 'name', visible: 'visible', position: 'position' };
  for (const [input, column] of Object.entries(keyMap)) {
    if (Object.hasOwn(req.body, input)) {
      fields.push(`${column} = ?`);
      values.push(input === 'visible' ? Number(Boolean(req.body[input])) : req.body[input]);
    }
  }
  if (Object.hasOwn(req.body, 'style')) {
    fields.push('style_json = ?');
    values.push(JSON.stringify(req.body.style || {}));
  }
  if (fields.length) {
    fields.push('version = version + 1', 'updated_at = ?');
    values.push(now(), layerId);
    db.prepare(`UPDATE layers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), layer.map_id);
    audit('update', 'layer', layerId, `更新图层字段 ${fields.slice(0, -2).join(', ')}`);
  }
  const map = getMap(layer.map_id);
  const updated = findLayerInMap(map, layerId);
  emitMapOp(layer.map_id, 'layer.updated', req.user, { entity: updated, version: updated?.version });
  res.json(map);
});

app.delete('/api/layers/:layerId', (req, res) => {
  const layerId = id(req.params.layerId);
  const layer = db.prepare('SELECT * FROM layers WHERE id = ?').get(layerId);
  if (!layer) return notFound(res, '图层不存在');
  if (!assertEditor(req, res, layer.map_id)) return;
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM layers WHERE map_id = ?').get(layer.map_id).count);
  if (count <= 1) return res.status(409).json({ error: '每张地图至少保留一个图层' });
  const attachments = db.prepare(`
    SELECT a.stored_name FROM attachments a
    JOIN features f ON f.id = a.feature_id
    WHERE f.layer_id = ?
  `).all(layerId);
  db.prepare('DELETE FROM layers WHERE id = ?').run(layerId);
  deleteStoredFiles(attachments);
  db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), layer.map_id);
  audit('delete', 'layer', layerId, `从地图 ${layer.map_id} 删除`);
  emitMapOp(layer.map_id, 'layer.deleted', req.user, { entityId: layerId });
  res.status(204).end();
});

function createFeature(layerId, payload) {
  const created = now();
  const geometry = payload.geometry || {};
  const type = geometry.type || payload.type;
  if (!['Point', 'LineString', 'Polygon'].includes(type)) throw new Error('不支持的几何类型');
  const result = db.prepare(`
    INSERT INTO features (layer_id, type, name, description, geometry_json, style_json, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(layerId, type, String(payload.name || '无标题要素').slice(0, 180), String(payload.description || ''), JSON.stringify(geometry), JSON.stringify(payload.style || {}), created, created);
  return Number(result.lastInsertRowid);
}

app.post('/api/layers/:layerId/features', (req, res) => {
  const layerId = id(req.params.layerId);
  const layer = db.prepare('SELECT * FROM layers WHERE id = ?').get(layerId);
  if (!layer) return notFound(res, '图层不存在');
  if (!assertEditor(req, res, layer.map_id)) return;
  const featureId = createFeature(layerId, req.body);
  db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), layer.map_id);
  audit('create', 'feature', featureId, `添加到图层 ${layerId}`);
  const map = getMap(layer.map_id);
  const feature = findFeatureInMap(map, featureId);
  emitMapOp(layer.map_id, 'feature.created', req.user, { entity: feature, version: feature?.version });
  res.status(201).json(map);
});

app.post('/api/layers/:layerId/features/bulk', (req, res) => {
  const layerId = id(req.params.layerId);
  const layer = db.prepare('SELECT * FROM layers WHERE id = ?').get(layerId);
  if (!layer) return notFound(res, '图层不存在');
  if (!assertEditor(req, res, layer.map_id)) return;
  const features = Array.isArray(req.body.features) ? req.body.features.slice(0, 2000) : [];
  db.exec('BEGIN');
  try {
    for (const feature of features) createFeature(layerId, feature);
    db.prepare(`
      INSERT INTO import_jobs (map_id, layer_id, file_name, format, row_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'completed', ?)
    `).run(layer.map_id, layerId, String(req.body.fileName || 'import'), String(req.body.format || 'GeoJSON').toUpperCase(), features.length, now());
    db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), layer.map_id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit('import', 'layer', layerId, `导入 ${features.length} 个要素，文件 ${req.body.fileName || 'import'}`);
  const map = getMap(layer.map_id);
  emitMapOp(layer.map_id, 'map.updated', req.user, { entity: map, version: map.version });
  res.status(201).json(map);
});

app.patch('/api/features/:featureId', (req, res) => {
  const featureId = id(req.params.featureId);
  const feature = db.prepare(`
    SELECT f.*, l.map_id FROM features f JOIN layers l ON l.id = f.layer_id WHERE f.id = ?
  `).get(featureId);
  if (!feature) return notFound(res, '要素不存在');
  if (!assertEditor(req, res, feature.map_id)) return;
  const latestMap = getMap(feature.map_id);
  if (!assertVersionMatch(req, res, feature.version, findFeatureInMap(latestMap, featureId))) return;
  const fields = [];
  const values = [];
  for (const key of ['name', 'description']) {
    if (Object.hasOwn(req.body, key)) {
      fields.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }
  if (Object.hasOwn(req.body, 'geometry')) {
    fields.push('geometry_json = ?', 'type = ?');
    values.push(JSON.stringify(req.body.geometry), req.body.geometry.type);
  }
  if (Object.hasOwn(req.body, 'style')) {
    fields.push('style_json = ?');
    values.push(JSON.stringify(req.body.style || {}));
  }
  if (Object.hasOwn(req.body, 'layerId')) {
    fields.push('layer_id = ?');
    values.push(id(req.body.layerId));
  }
  if (fields.length) {
    fields.push('version = version + 1', 'updated_at = ?');
    values.push(now(), featureId);
    db.prepare(`UPDATE features SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), feature.map_id);
    audit('update', 'feature', featureId, `更新字段 ${fields.slice(0, -2).join(', ')}`);
  }
  const map = getMap(feature.map_id);
  const updated = findFeatureInMap(map, featureId);
  emitMapOp(feature.map_id, 'feature.updated', req.user, { entity: updated, version: updated?.version });
  res.json(map);
});

app.post('/api/features/:featureId/attachments', mediaUpload.array('files', MAX_FILES_PER_UPLOAD), asyncRoute(async (req, res) => {
  const featureId = id(req.params.featureId);
  const files = Array.isArray(req.files) ? req.files : [];
  const feature = db.prepare(`
    SELECT f.id, f.name, l.map_id FROM features f
    JOIN layers l ON l.id = f.layer_id
    WHERE f.id = ?
  `).get(featureId);
  if (!feature) {
    cleanupTemporaryFiles(files);
    return notFound(res, '要素不存在');
  }
  if (!assertEditor(req, res, feature.map_id)) {
    cleanupTemporaryFiles(files);
    return;
  }
  if (!files.length) throw httpError('请选择要上传的图片或视频');
  const existingCount = Number(db.prepare('SELECT COUNT(*) AS count FROM attachments WHERE feature_id = ?').get(featureId).count);
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_FEATURE) {
    cleanupTemporaryFiles(files);
    throw httpError(`每个地点最多保存 ${MAX_ATTACHMENTS_PER_FEATURE} 个附件`, 409);
  }

  const prepared = [];
  let transactionStarted = false;
  try {
    for (const file of files) {
      const detected = await fileTypeFromFile(file.path);
      if (!detected || !supportedMediaTypes.has(detected.mime)) {
        throw httpError('文件内容不是受支持的图片或视频格式', 415);
      }
      const kind = detected.mime.startsWith('image/') ? 'image' : 'video';
      const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      if (file.size > maxBytes) {
        const maxMb = Math.round(maxBytes / 1024 / 1024);
        throw httpError(`${kind === 'image' ? '图片' : '视频'}不能超过 ${maxMb} MB`, 413);
      }
      const extension = String(detected.ext).toLowerCase().replace(/[^a-z0-9]/g, '');
      const storedName = `${crypto.randomUUID()}.${extension}`;
      prepared.push({
        file,
        kind,
        storedName,
        destination: path.join(uploadsDir, storedName),
        mimeType: detected.mime,
        originalName: cleanOriginalName(file.originalname),
        moved: false,
      });
    }

    db.exec('BEGIN');
    transactionStarted = true;
    const insert = db.prepare(`
      INSERT INTO attachments (feature_id, kind, original_name, stored_name, mime_type, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of prepared) {
      renameSync(item.file.path, item.destination);
      item.moved = true;
      insert.run(featureId, item.kind, item.originalName, item.storedName, item.mimeType, item.file.size, now());
    }
    db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), feature.map_id);
    db.prepare('UPDATE features SET version = version + 1, updated_at = ? WHERE id = ?').run(now(), featureId);
    audit('upload', 'feature', featureId, `上传 ${prepared.length} 个图片/视频附件`);
    db.exec('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) db.exec('ROLLBACK');
    for (const item of prepared) {
      if (item.moved) safeUnlink(item.destination);
    }
    cleanupTemporaryFiles(files);
    throw error;
  }

  const map = getMap(feature.map_id);
  const updated = findFeatureInMap(map, featureId);
  emitMapOp(feature.map_id, 'attachment.created', req.user, { entity: updated, version: updated?.version });
  res.status(201).json(map);
}));

app.delete('/api/attachments/:attachmentId', (req, res) => {
  const attachmentId = id(req.params.attachmentId);
  const attachment = db.prepare(`
    SELECT a.*, f.name AS feature_name, l.map_id FROM attachments a
    JOIN features f ON f.id = a.feature_id
    JOIN layers l ON l.id = f.layer_id
    WHERE a.id = ?
  `).get(attachmentId);
  if (!attachment) return notFound(res, '附件不存在');
  if (!assertEditor(req, res, attachment.map_id)) return;
  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId);
  db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), attachment.map_id);
  db.prepare('UPDATE features SET version = version + 1, updated_at = ? WHERE id = ?').run(now(), attachment.feature_id);
  audit('delete', 'attachment', attachmentId, `从“${attachment.feature_name}”删除附件`);
  deleteStoredFiles([attachment]);
  const map = getMap(attachment.map_id);
  const updated = findFeatureInMap(map, attachment.feature_id);
  emitMapOp(attachment.map_id, 'attachment.deleted', req.user, {
    entity: updated,
    entityId: attachmentId,
    version: updated?.version,
  });
  res.json(map);
});

app.delete('/api/features/:featureId', (req, res) => {
  const featureId = id(req.params.featureId);
  const feature = db.prepare(`
    SELECT f.*, l.map_id FROM features f JOIN layers l ON l.id = f.layer_id WHERE f.id = ?
  `).get(featureId);
  if (!feature) return notFound(res, '要素不存在');
  if (!assertEditor(req, res, feature.map_id)) return;
  const attachments = db.prepare('SELECT stored_name FROM attachments WHERE feature_id = ?').all(featureId);
  db.prepare('DELETE FROM features WHERE id = ?').run(featureId);
  deleteStoredFiles(attachments);
  db.prepare('UPDATE maps SET updated_at = ? WHERE id = ?').run(now(), feature.map_id);
  audit('delete', 'feature', featureId, `删除“${feature.name}”`);
  emitMapOp(feature.map_id, 'feature.deleted', req.user, { entityId: featureId });
  res.status(204).end();
});

app.post('/api/maps/:mapId/share', (req, res) => {
  const mapId = id(req.params.mapId);
  if (!getMap(mapId)) return notFound(res, '地图不存在');
  if (!assertEditor(req, res, mapId)) return;
  const access = req.body.access === 'edit' ? 'edit' : 'view';
  let share = db.prepare('SELECT * FROM shares WHERE map_id = ? AND access = ?').get(mapId, access);
  if (!share) {
    const token = crypto.randomBytes(12).toString('base64url');
    const result = db.prepare('INSERT INTO shares (map_id, token, access, created_at) VALUES (?, ?, ?, ?)').run(mapId, token, access, now());
    share = db.prepare('SELECT * FROM shares WHERE id = ?').get(result.lastInsertRowid);
    audit('share', 'map', mapId, `创建 ${access} 分享链接`);
  }
  db.prepare("UPDATE maps SET visibility = 'link', updated_at = ? WHERE id = ?").run(now(), mapId);
  res.json(share);
});

app.get('/api/public/:token', (req, res) => {
  const map = getPublicMap(req.params.token);
  return map ? res.json(map) : notFound(res, '分享链接无效');
});

app.use('/api/admin', (req, res, next) => {
  // 1) 已登录的数据管理员直接放行。
  if (req.user?.role === 'admin') return next();
  // 2) 引导/应急：通过环境变量口令放行（仅限非默认口令，避免公网误开放）。
  if (ADMIN_KEY !== 'omm-admin-2026' && req.get('x-admin-key') === ADMIN_KEY) return next();
  if (!req.user) return res.status(401).json({ error: '请先登录数据管理员账号' });
  return res.status(403).json({ error: '需要数据管理员权限' });
});

app.get('/api/admin/stats', (req, res) => res.json(adminStats()));
app.get('/api/admin/projects', (req, res) => res.json(listProjects()));
app.get('/api/admin/maps', (req, res) => res.json(listMaps()));
app.get('/api/admin/layers', (req, res) => res.json(db.prepare(`
  SELECT l.*, m.name AS map_name, m.project_id, p.name AS project_name,
    (SELECT COUNT(*) FROM features f WHERE f.layer_id = l.id) AS feature_count
  FROM layers l
  JOIN maps m ON m.id = l.map_id
  LEFT JOIN projects p ON p.id = m.project_id
  ORDER BY l.updated_at DESC
`).all()));
app.get('/api/admin/features', (req, res) => res.json(db.prepare(`
  SELECT f.id, f.name, f.type, f.description, f.geometry_json, f.style_json, f.created_at, f.updated_at,
    l.name AS layer_name, l.id AS layer_id, m.name AS map_name, m.id AS map_id, m.project_id, p.name AS project_name,
    (SELECT COUNT(*) FROM attachments a WHERE a.feature_id = f.id) AS attachment_count
  FROM features f
  JOIN layers l ON l.id = f.layer_id
  JOIN maps m ON m.id = l.map_id
  LEFT JOIN projects p ON p.id = m.project_id
  ORDER BY f.updated_at DESC
`).all()));
app.get('/api/admin/attachments', (req, res) => res.json(db.prepare(`
  SELECT a.id, a.kind, a.original_name, a.mime_type, a.size_bytes, a.created_at,
    f.id AS feature_id, f.name AS feature_name, l.name AS layer_name, m.id AS map_id, m.name AS map_name
  FROM attachments a
  JOIN features f ON f.id = a.feature_id
  JOIN layers l ON l.id = f.layer_id
  JOIN maps m ON m.id = l.map_id
  ORDER BY a.created_at DESC
`).all()));
app.get('/api/admin/imports', (req, res) => res.json(db.prepare(`
  SELECT i.*, m.name AS map_name, l.name AS layer_name FROM import_jobs i
  JOIN maps m ON m.id = i.map_id LEFT JOIN layers l ON l.id = i.layer_id ORDER BY i.created_at DESC
`).all()));
app.get('/api/admin/audit', (req, res) => res.json(db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 250').all()));
app.get('/api/admin/users', (req, res) => res.json(db.prepare(`
  SELECT u.*,
    (SELECT COUNT(*) FROM project_members pm WHERE pm.user_id = u.id) AS project_count,
    (SELECT COUNT(*) FROM maps m JOIN projects p ON p.id = m.project_id WHERE p.owner_user_id = u.id) AS map_count
  FROM users u ORDER BY u.created_at DESC
`).all()));

app.post('/api/admin/projects', (req, res) => {
  const created = now();
  const name = String(req.body.name || '未命名项目').trim().slice(0, 120) || '未命名项目';
  const ownerUserId = id(req.body.ownerUserId ?? req.body.owner_user_id);
  const owner = ownerUserId ? db.prepare('SELECT id FROM users WHERE id = ?').get(ownerUserId) : null;
  const result = db.prepare(`
    INSERT INTO projects (name, description, owner_user_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, String(req.body.description || ''), owner?.id || null, req.body.status === 'archived' ? 'archived' : 'active', created, created);
  const projectId = Number(result.lastInsertRowid);
  if (owner?.id) {
    db.prepare(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`)
      .run(projectId, owner.id, created);
  }
  audit('create', 'project', projectId, `创建项目“${name}”`);
  res.status(201).json(listProjects());
});

app.patch('/api/admin/projects/:projectId', (req, res) => {
  const projectId = id(req.params.projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return notFound(res, '项目不存在');
  const name = Object.hasOwn(req.body, 'name') ? String(req.body.name || '').trim().slice(0, 120) || project.name : project.name;
  const description = Object.hasOwn(req.body, 'description') ? String(req.body.description || '') : project.description;
  const status = req.body.status === 'archived' ? 'archived' : req.body.status === 'active' ? 'active' : project.status;
  const ownerUserId = Object.hasOwn(req.body, 'ownerUserId')
    ? (db.prepare('SELECT id FROM users WHERE id = ?').get(id(req.body.ownerUserId))?.id || null)
    : project.owner_user_id;
  db.prepare('UPDATE projects SET name = ?, description = ?, status = ?, owner_user_id = ?, updated_at = ? WHERE id = ?')
    .run(name, description, status, ownerUserId, now(), projectId);
  if (ownerUserId) {
    db.prepare(`INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)
      ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner'`).run(projectId, ownerUserId, now());
  }
  audit('update', 'project', projectId, `更新项目“${name}”`);
  return res.json(listProjects());
});

app.post('/api/admin/users', (req, res) => {
  const created = now();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: '请输入邮箱' });
  const name = String(req.body.name || '新用户').trim().slice(0, 60) || '新用户';
  const role = normalizeGlobalRole(req.body.role);
  const status = req.body.status === 'disabled' ? 'disabled' : 'active';
  const password = String(req.body.password || '');
  const passwordHash = password ? hashPassword(password) : null;
  try {
    const result = db.prepare(`
      INSERT INTO users (name, display_name, email, role, status, password_hash, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, name, email, role, status, passwordHash, created, created);
    audit('create', 'user', result.lastInsertRowid, `创建用户 ${email}`);
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: '该邮箱已存在' });
    }
    throw error;
  }
  res.status(201).json(db.prepare('SELECT * FROM users ORDER BY created_at DESC').all());
});

app.patch('/api/admin/users/:userId', (req, res) => {
  const userId = id(req.params.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return notFound(res, '用户不存在');
  const role = Object.hasOwn(req.body, 'role') ? normalizeGlobalRole(req.body.role) : user.role;
  const status = req.body.status || user.status;
  db.prepare('UPDATE users SET role = ?, status = ?, last_seen = ? WHERE id = ?').run(role, status, now(), userId);
  audit('update', 'user', userId, `role=${role}, status=${status}`);
  res.json(db.prepare('SELECT * FROM users ORDER BY created_at DESC').all());
});

app.get('/api/admin/backup', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="open-my-map-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exportedAt: now(), version: 2, data: backupData() });
});

app.delete('/api/admin/imports/:importId', (req, res) => {
  const importId = id(req.params.importId);
  db.prepare('DELETE FROM import_jobs WHERE id = ?').run(importId);
  audit('delete', 'import', importId, '删除导入记录');
  res.status(204).end();
});

if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h' }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  cleanupTemporaryFiles([...(Array.isArray(req.files) ? req.files : []), req.file].filter(Boolean));
  const isSizeLimit = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
  const isFileCountLimit = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT';
  const status = isSizeLimit ? 413 : Number(error.status) || 400;
  const message = isSizeLimit
    ? `单个视频不能超过 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB`
    : isFileCountLimit
      ? `每次最多上传 ${MAX_FILES_PER_UPLOAD} 个文件`
      : error.message || '请求处理失败';
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
attachRealtime(server);
server.listen(port, '0.0.0.0', () => {
  console.log(`Open My Map server listening on http://0.0.0.0:${port}`);
});
