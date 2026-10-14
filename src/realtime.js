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
    if (closed) return;
    clearTimers();
    const token = getSessionId();
    const connection = new WebSocket(wsUrl(token));
    socket = connection;
    emitStatus('connecting');

    connection.addEventListener('open', () => {
      if (closed || socket !== connection) return;
      attempt = 0;
      emitStatus('connected');
      socket.send(JSON.stringify({ type: 'join', mapId: Number(mapId) }));
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    });

    connection.addEventListener('message', (event) => {
      if (closed || socket !== connection) return;
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

    connection.addEventListener('close', () => {
      if (closed || socket !== connection) return;
      clearTimers();
      emitStatus('disconnected');
      scheduleReconnect();
    });

    connection.addEventListener('error', () => {
      if (closed || socket !== connection) return;
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
        const closingSocket = socket;
        if (closingSocket?.readyState === WebSocket.CONNECTING) {
          closingSocket.addEventListener('open', () => closingSocket.close(), { once: true });
        } else {
          closingSocket?.close();
        }
      } catch {
        // ignore
      }
    },
  };
}

export function applyMapOp(mapData, op) {
  if (!mapData || !op) return mapData;
  if (op.mapId != null && String(op.mapId) !== String(mapData.id)) return mapData;
  const olderVersion = (incoming, current) => incoming != null && current != null
    && Number.isFinite(Number(incoming)) && Number.isFinite(Number(current))
    && Number(incoming) < Number(current);
  // The envelope version is the map's version; op.version remains the version
  // of the feature or layer. Compare only versions of the same entity type.
  if (op.action !== 'map.deleted' && olderVersion(op.mapVersion, mapData.version)) return mapData;
  const ordered = (items) => [...items].sort((left, right) => {
    const leftPosition = Number.isFinite(left.position) ? left.position : Infinity;
    const rightPosition = Number.isFinite(right.position) ? right.position : Infinity;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    // Legacy rows without positions retain their existing order.
    if (leftPosition === Infinity) return 0;
    return Number(left.id) - Number(right.id);
  });
  const currentLayers = new Map((mapData.layers || []).map((layer) => [layer.id, layer]));
  const currentFeatures = new Map((mapData.layers || []).flatMap((layer) => (layer.features || []).map((feature) => [feature.id, feature])));
  const snapshotDowngradesEntities = (layers) => layers.some((layer) => {
    const currentLayer = currentLayers.get(layer.id);
    if (olderVersion(layer.version, currentLayer?.version)) return true;
    return (layer.features || []).some((feature) => {
      const currentFeature = currentFeatures.get(feature.id);
      return olderVersion(feature.version, currentFeature?.version);
    });
  });
  const next = {
    ...mapData,
    layers: (mapData.layers || []).map((layer) => ({
      ...layer,
      features: [...(layer.features || [])],
    })),
  };
  const withMapMetadata = (data) => ({
    ...data,
    ...(op.mapVersion != null && Number.isFinite(Number(op.mapVersion)) ? { version: Number(op.mapVersion) } : {}),
    ...(typeof op.contentFingerprint === 'string' ? { contentFingerprint: op.contentFingerprint } : {}),
  });

  const upsertFeature = (entity) => {
    if (!entity?.id) return false;
    const currentLayer = next.layers.find((layer) => layer.features.some((feature) => feature.id === entity.id));
    const current = currentLayer?.features.find((feature) => feature.id === entity.id);
    if (olderVersion(entity.version ?? op.version, current?.version)) return false;
    const targetLayerId = entity.layerId ?? entity.layer_id ?? currentLayer?.id;
    if (!next.layers.some((layer) => layer.id === targetLayerId)) return false;
    const normalized = { ...current, ...entity };
    if (entity.version == null && op.version != null) normalized.version = op.version;
    // Replace an existing row in place, then sort by persisted positions.
    // Editing its name, geometry, or attachments must not append it to the end.
    next.layers = next.layers.map((layer) => ({
      ...layer,
      features: layer.id === targetLayerId
        ? ordered(currentLayer?.id === targetLayerId
          ? layer.features.map((feature) => feature.id === entity.id ? normalized : feature)
          : [...layer.features, normalized])
        : layer.features.filter((feature) => feature.id !== entity.id),
    }));
    return true;
  };

  const upsertLayer = (entity) => {
    if (!entity?.id) return false;
    const index = next.layers.findIndex((layer) => layer.id === entity.id);
    const current = next.layers[index];
    if (olderVersion(entity.version ?? op.version, current?.version) || snapshotDowngradesEntities([entity])) return false;
    const normalized = {
      ...current,
      ...entity,
      features: ordered(entity.features || current?.features || []),
    };
    if (entity.version == null && op.version != null) normalized.version = op.version;
    if (index >= 0) next.layers[index] = normalized;
    else next.layers = [...next.layers, normalized];
    next.layers = ordered(next.layers);
    return true;
  };

  switch (op.action) {
    case 'map.updated':
      if (op.entity) {
        if ((op.entity.id != null && op.entity.id !== mapData.id)
          || olderVersion(op.entity.version ?? op.version, mapData.version)
          || (op.entity.layers && snapshotDowngradesEntities(op.entity.layers))) return mapData;
        return withMapMetadata({
          ...mapData,
          ...op.entity,
          layers: ordered(op.entity.layers || next.layers).map((layer) => ({ ...layer, features: ordered(layer.features || []) })),
        });
      }
      return mapData;
    case 'map.deleted':
      return null;
    case 'layer.created':
    case 'layer.updated':
      return upsertLayer(op.entity) ? withMapMetadata(next) : mapData;
    case 'layer.deleted':
      next.layers = next.layers.filter((layer) => layer.id !== op.entityId);
      return withMapMetadata(next);
    case 'feature.created':
    case 'feature.updated':
    case 'attachment.created':
    case 'attachment.deleted':
      return upsertFeature(op.entity) ? withMapMetadata(next) : mapData;
    case 'feature.deleted':
      next.layers = next.layers.map((layer) => ({
        ...layer,
        features: layer.features.filter((feature) => feature.id !== op.entityId),
      }));
      return withMapMetadata(next);
    default:
      return mapData;
  }
}
