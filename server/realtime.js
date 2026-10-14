import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { canEditMap, canViewMap, getSessionRow, getUserById, publicUser } from './db.js';

/** @type {WebSocketServer | null} */
let wss = null;

/** mapId -> Set<WebSocket> */
const rooms = new Map();

function send(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(payload));
  }
}

function roomKey(mapId) {
  return String(mapId);
}

function getRoom(mapId) {
  const key = roomKey(mapId);
  if (!rooms.has(key)) rooms.set(key, new Set());
  return rooms.get(key);
}

function leaveRoom(socket) {
  if (!socket.mapId) return;
  const room = rooms.get(roomKey(socket.mapId));
  if (room) {
    room.delete(socket);
    if (!room.size) rooms.delete(roomKey(socket.mapId));
    else broadcastPresence(socket.mapId);
  }
  socket.mapId = null;
}

function presenceList(mapId) {
  const room = rooms.get(roomKey(mapId));
  if (!room) return [];
  const byUser = new Map();
  for (const socket of room) {
    if (!socket.user) continue;
    const existing = byUser.get(socket.user.id);
    const entry = {
      userId: socket.user.id,
      name: socket.user.displayName || socket.user.name,
      role: socket.canEdit ? 'editor' : 'viewer',
      tool: socket.presence?.tool || 'pan',
      selectedFeatureId: socket.presence?.selectedFeatureId ?? null,
      cursor: socket.presence?.cursor ?? null,
    };
    if (!existing) byUser.set(socket.user.id, entry);
  }
  return [...byUser.values()];
}

function broadcastPresence(mapId) {
  const payload = { type: 'presence.sync', mapId, peers: presenceList(mapId) };
  const room = rooms.get(roomKey(mapId));
  if (!room) return;
  for (const socket of room) send(socket, payload);
}

function authenticate(token) {
  const session = getSessionRow(token);
  if (!session) return null;
  const user = getUserById(session.user_id);
  if (!user || user.status === 'disabled') return null;
  return publicUser(user);
}

export function broadcastMapOp(mapId, op) {
  const room = rooms.get(roomKey(mapId));
  if (!room?.size) return;
  const { excludeSocket, ...rest } = op;
  const payload = { type: 'op', mapId, ...rest };
  for (const socket of room) {
    if (excludeSocket && socket === excludeSocket) continue;
    send(socket, payload);
  }
  if (op.action === 'map.deleted') {
    // 回收站保留数据，但该地图不再允许协作或发送实时位置。
    for (const socket of room) {
      socket.mapId = null;
      socket.canEdit = false;
      socket.presence = { tool: 'pan', selectedFeatureId: null, cursor: null };
      send(socket, { type: 'left', mapId });
    }
    rooms.delete(roomKey(mapId));
  }
}

export function createMapOp({ action, actor, entity = null, entityId = null, version = null, opId = null }) {
  return {
    opId: opId || crypto.randomUUID(),
    action,
    actor: actor ? {
      id: actor.id,
      name: actor.displayName || actor.name || actor.display_name || '',
    } : null,
    entity,
    entityId,
    version,
    at: new Date().toISOString(),
  };
}

export function attachRealtime(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    socket.isAlive = true;
    socket.user = null;
    socket.mapId = null;
    socket.canEdit = false;
    socket.presence = { tool: 'pan', selectedFeatureId: null, cursor: null };

    const url = new URL(req.url || '/ws', 'http://localhost');
    const token = url.searchParams.get('token') || '';
    if (token) {
      socket.user = authenticate(token);
    }

    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return send(socket, { type: 'error', error: '无效消息' });
      }

      if (message.type === 'auth') {
        socket.user = authenticate(String(message.token || ''));
        return send(socket, {
          type: 'auth.result',
          ok: Boolean(socket.user),
          user: socket.user,
        });
      }

      if (message.type === 'ping') {
        return send(socket, { type: 'pong', at: new Date().toISOString() });
      }

      if (!socket.user) {
        return send(socket, { type: 'error', error: '请先登录' });
      }

      if (message.type === 'join') {
        const mapId = Number.parseInt(message.mapId, 10);
        if (!Number.isFinite(mapId) || !canViewMap(socket.user, mapId)) {
          return send(socket, { type: 'error', error: '无权加入该地图房间' });
        }
        leaveRoom(socket);
        socket.mapId = mapId;
        socket.canEdit = canEditMap(socket.user, mapId);
        getRoom(mapId).add(socket);
        send(socket, {
          type: 'joined',
          mapId,
          canEdit: socket.canEdit,
          peers: presenceList(mapId),
        });
        broadcastPresence(mapId);
        return;
      }

      if (message.type === 'leave') {
        const mapId = socket.mapId;
        leaveRoom(socket);
        if (mapId) broadcastPresence(mapId);
        return send(socket, { type: 'left' });
      }

      if (message.type === 'presence.update') {
        if (!socket.mapId) return;
        socket.presence = {
          tool: message.tool || 'pan',
          selectedFeatureId: message.selectedFeatureId ?? null,
          cursor: message.cursor ?? null,
        };
        broadcastPresence(socket.mapId);
      }
    });

    socket.on('close', () => {
      const mapId = socket.mapId;
      leaveRoom(socket);
      if (mapId) broadcastPresence(mapId);
    });
  });

  const heartbeat = setInterval(() => {
    if (!wss) return;
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}

export function getRealtimeStats() {
  return {
    rooms: rooms.size,
    clients: wss ? wss.clients.size : 0,
  };
}
