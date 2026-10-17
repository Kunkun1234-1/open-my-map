const SESSION_KEY = 'open-my-map-session';

export function getSessionId() {
  return window.localStorage.getItem(SESSION_KEY) || '';
}

export function setSessionId(token) {
  if (token) window.localStorage.setItem(SESSION_KEY, token);
  else window.localStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const sessionId = getSessionId();
  if (sessionId && !headers.authorization) headers.authorization = `Bearer ${sessionId}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `请求失败 (${response.status})`);
    error.status = response.status;
    error.body = body;
    error.conflict = Boolean(body.conflict);
    error.latest = body.latest;
    throw error;
  }
  return body;
}

async function uploadMedia(path, files, field = 'files', fields = {}) {
  const body = new FormData();
  for (const file of files) body.append(field, file, file.name);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.append(key, String(value ?? ''));
  }
  const headers = {};
  const sessionId = getSessionId();
  if (sessionId) headers.authorization = `Bearer ${sessionId}`;
  const response = await fetch(path, { method: 'POST', body, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败 (${response.status})`);
    error.status = response.status;
    error.body = payload;
    error.conflict = Boolean(payload.conflict);
    error.latest = payload.latest;
    throw error;
  }
  return payload;
}

const adminRequest = (path, options = {}) => request(path, {
  ...options,
  headers: {
    ...(options.headers || {}),
    'x-admin-key': window.sessionStorage.getItem('open-my-map-admin-key') || '',
  },
});

async function fetchProtectedImage(url) {
  const token = getSessionId();
  const response = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${response.status})`);
  }
  return response.blob();
}

async function downloadAdminBackup() {
  const response = await fetch('/api/admin/backup', {
    headers: { 'x-admin-key': window.sessionStorage.getItem('open-my-map-admin-key') || '' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `请求失败 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'open-my-map-backup.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

export const api = {
  mapPreview: (mapId) => request(`/api/maps/${mapId}/preview`),
  uploadCover: (kind, entityId, file, metadata = {}) => uploadMedia(`/api/${kind}/${entityId}/cover`, [file], 'file', metadata),
  resetCover: (kind, entityId, metadata) => request(`/api/${kind}/${entityId}/cover`, {
    method: 'DELETE',
    ...(metadata ? { body: JSON.stringify(metadata) } : {}),
  }),
  fetchCover: fetchProtectedImage,
  fetchAvatar: fetchProtectedImage,
  fetchImage: fetchProtectedImage,
  uploadHomeBackground: (file) => uploadMedia('/api/auth/me/home-background', [file], 'file'),
  resetHomeBackground: () => request('/api/auth/me/home-background', { method: 'DELETE' }),
  updateHomeAppearance: (body) => request('/api/auth/me/home-appearance', { method: 'PATCH', body: JSON.stringify(body) }),
  uploadAvatar: (file) => uploadMedia('/api/auth/me/avatar', [file], 'file'),
  resetAvatar: () => request('/api/auth/me/avatar', { method: 'DELETE' }),
  health: () => request('/api/health'),
  me: () => request('/api/auth/me'),
  updateProfile: (body) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body) => request('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: ({ name, email, password }) => request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  sessions: () => request('/api/auth/sessions'),
  revokeSessions: () => request('/api/auth/sessions', { method: 'DELETE' }),
  projects: () => request('/api/projects'),
  createProject: (body) => request('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (projectId, body) => request(`/api/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (projectId) => request(`/api/projects/${projectId}`, { method: 'DELETE' }),
  inviteProjectMember: (projectId, body) => request(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(body) }),
  projectMembers: (projectId) => request(`/api/projects/${projectId}/members`),
  updateProjectMember: (projectId, userId, body) => request(`/api/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeProjectMember: (projectId, userId) => request(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
  transferProject: (projectId, userId) => request(`/api/projects/${projectId}/transfer`, { method: 'POST', body: JSON.stringify({ userId }) }),
  maps: () => request('/api/maps'),
  trashedMaps: () => request('/api/maps/trash'),
  trashMap: (mapId) => request(`/api/maps/${mapId}/trash`, { method: 'POST' }),
  restoreMap: (mapId) => request(`/api/maps/${mapId}/restore`, { method: 'POST' }),
  favoriteMap: (mapId, favorite) => request(`/api/maps/${mapId}/favorite`, { method: 'PATCH', body: JSON.stringify({ favorite }) }),
  map: (mapId) => request(`/api/maps/${mapId}`),
  createMap: (body) => request('/api/maps', { method: 'POST', body: JSON.stringify(body) }),
  updateMap: (mapId, body) => request(`/api/maps/${mapId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createCheckpoint: (mapId, body = {}) => request(`/api/maps/${mapId}/checkpoints`, { method: 'POST', body: JSON.stringify(body) }),
  restoreCheckpoint: (mapId, body) => request(`/api/maps/${mapId}/restore-checkpoint`, { method: 'POST', body: JSON.stringify(body) }),
  reorderLayers: (mapId, body) => request(`/api/maps/${mapId}/reorder`, { method: 'POST', body: JSON.stringify(body) }),
  reorderFeatures: (mapId, body) => request(`/api/maps/${mapId}/features/reorder`, { method: 'POST', body: JSON.stringify(body) }),
  saveStoryOrder: (mapId, body) => request(`/api/maps/${mapId}/story-order`, { method: 'POST', body: JSON.stringify(body) }),
  deleteMap: (mapId) => request(`/api/maps/${mapId}`, { method: 'DELETE' }),
  addLayer: (mapId, body) => request(`/api/maps/${mapId}/layers`, { method: 'POST', body: JSON.stringify(body) }),
  saveDirections: (mapId, body) => request(`/api/maps/${mapId}/directions`, { method: 'POST', body: JSON.stringify(body) }),
  updateLayer: (layerId, body) => request(`/api/layers/${layerId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLayer: (layerId, body = {}) => request(`/api/layers/${layerId}`, { method: 'DELETE', body: JSON.stringify(body) }),
  updateLayerStyle: (layerId, body) => request(`/api/layers/${layerId}/style`, { method: 'PATCH', body: JSON.stringify(body) }),
  addFeature: (layerId, body) => request(`/api/layers/${layerId}/features`, { method: 'POST', body: JSON.stringify(body) }),
  importFeatures: (layerId, body) => request(`/api/layers/${layerId}/features/bulk`, { method: 'POST', body: JSON.stringify(body) }),
  updateFeature: (featureId, body) => request(`/api/features/${featureId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteFeature: (featureId, body = {}) => request(`/api/features/${featureId}`, { method: 'DELETE', body: JSON.stringify(body) }),
  moveFeature: (featureId, body) => request(`/api/features/${featureId}/move`, { method: 'POST', body: JSON.stringify(body) }),
  uploadAttachments: (featureId, files) => uploadMedia(`/api/features/${featureId}/attachments`, files),
  deleteAttachment: (attachmentId) => request(`/api/attachments/${attachmentId}`, { method: 'DELETE' }),
  share: (mapId, access = 'view') => request(`/api/maps/${mapId}/share`, { method: 'POST', body: JSON.stringify({ access }) }),
  publicMap: (token) => request(`/api/public/${token}`),
  admin: {
    stats: () => adminRequest('/api/admin/stats'),
    projects: () => adminRequest('/api/admin/projects'),
    maps: () => adminRequest('/api/admin/maps'),
    layers: () => adminRequest('/api/admin/layers'),
    features: () => adminRequest('/api/admin/features'),
    attachments: () => adminRequest('/api/admin/attachments'),
    imports: () => adminRequest('/api/admin/imports'),
    audit: () => adminRequest('/api/admin/audit'),
    users: () => adminRequest('/api/admin/users'),
    createUser: (body) => adminRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    updateUser: (userId, body) => adminRequest(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    createProject: (body) => adminRequest('/api/admin/projects', { method: 'POST', body: JSON.stringify(body) }),
    updateProject: (projectId, body) => adminRequest(`/api/admin/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteImport: (importId) => adminRequest(`/api/admin/imports/${importId}`, { method: 'DELETE' }),
    backup: downloadAdminBackup,
  },
};
