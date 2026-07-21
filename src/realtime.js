import { getSessionId } from './api.js';

function wsUrl(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const query = params.toString();
  return `${protocol}//${window.location.host}/ws${query ? `?${query}` : ''}`;
}

/**
 * Connect to a map collaboration room.
 */
export function connectMapRoom(mapId, handlers = {}) {
  let socket = null;
  let closed = false;
  let reconnectTimer = null;
  let pingTimer = null;
  let attempt = 0;
  let canEdit = false;
  const recentOpIds = new Set();

  const emitStatus = (status, detail) => {
    handlers.onStatus?.(status, detail);
  };

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const rememberOp = (opId) => {
    if (!opId) return;
    recentOpIds.add(opId);
    if (recentOpIds.size > 200) {
      const first = recentOpIds.values().next().value;
      recentOpIds.delete(first);
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(10000, 800 * (2 ** Math.min(attempt, 4)));
    attempt += 1;
    emitStatus('reconnecting', { attempt, delay });
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    clearTimers();
    const token = getSessionId();
    socket = new WebSocket(wsUrl(token));
    emitStatus('connecting');

    socket.addEventListener('open', () => {
      attempt = 0;
      emitStatus('connected');
      socket.send(JSON.stringify({ type: 'join', mapId: Number(mapId) }));
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'joined') {
        canEdit = Boolean(message.canEdit);
        emitStatus('joined', { canEdit, peers: message.peers || [] });
        handlers.onPresence?.(message.peers || []);
        return;
      }
      if (message.type === 'presence.sync') {
        handlers.onPresence?.(message.peers || []);
        return;
      }
      if (message.type === 'op') {
        if (message.opId && recentOpIds.has(message.opId)) return;
        handlers.onOp?.(message);
        return;
      }
      if (message.type === 'error') {
        emitStatus('error', { error: message.error });
      }
    });

    socket.addEventListener('close', () => {
      clearTimers();
      emitStatus('disconnected');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      emitStatus('error', { error: '实时连接异常' });
    });
  };

  connect();

  return {
    get canEdit() {
      return canEdit;
    },
    updatePresence(presence) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'presence.update', ...presence }));
    },
    trackLocalOp(opId) {
      rememberOp(opId);
    },
    close() {
      closed = true;
      clearTimers();
      try {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'leave' }));
        }
        socket?.close();
      } catch {
        // ignore
      }
    },
  };
}

export function applyMapOp(mapData, op) {
  if (!mapData || !op) return mapData;
  const next = {
    ...mapData,
    layers: (mapData.layers || []).map((layer) => ({
      ...layer,
      features: [...(layer.features || [])],
    })),
  };

  const upsertFeature = (entity) => {
    if (!entity?.id) return;
    const targetLayerId = entity.layerId ?? entity.layer_id;
    next.layers = next.layers.map((layer) => ({
      ...layer,
      features: layer.features.filter((feature) => feature.id !== entity.id),
    }));
    next.layers = next.layers.map((layer) => {
      if (layer.id !== targetLayerId) return layer;
      return { ...layer, features: [...layer.features, entity] };
    });
  };

  const upsertLayer = (entity) => {
    if (!entity?.id) return;
    const index = next.layers.findIndex((layer) => layer.id === entity.id);
    const normalized = {
      ...entity,
      features: entity.features || (index >= 0 ? next.layers[index].features : []),
    };
    if (index >= 0) next.layers[index] = normalized;
    else next.layers = [...next.layers, normalized];
  };

  switch (op.action) {
    case 'map.updated':
      if (op.entity) {
        return {
          ...op.entity,
          layers: op.entity.layers || next.layers,
        };
      }
      return next;
    case 'map.deleted':
      return null;
    case 'layer.created':
    case 'layer.updated':
      upsertLayer(op.entity);
      return next;
    case 'layer.deleted':
      next.layers = next.layers.filter((layer) => layer.id !== op.entityId);
      return next;
    case 'feature.created':
    case 'feature.updated':
    case 'attachment.created':
    case 'attachment.deleted':
      upsertFeature(op.entity);
      return next;
    case 'feature.deleted':
      next.layers = next.layers.map((layer) => ({
        ...layer,
        features: layer.features.filter((feature) => feature.id !== op.entityId),
      }));
      return next;
    default:
      return next;
  }
}
