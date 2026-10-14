import { loadAMap, toDisplayLngLat, toStorageLngLat } from './amap.js';

export const MAX_ROUTE_STOPS = 10; // Origin plus up to nine destinations, including the final stop.
export const ROUTE_MODES = ['driving', 'walking', 'cycling'];

export function validRoutePosition(value) {
  if (!Array.isArray(value) || value.length < 2 || value[0] == null || value[1] == null || String(value[0]).trim() === '' || String(value[1]).trim() === '') return false;
  const [lng, lat] = value.map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

export function parseRouteCoordinate(value) {
  const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const position = [Number(match[1]), Number(match[2])];
  if (!validRoutePosition(position)) throw new Error('坐标超出范围。请按经度,纬度输入。');
  return position;
}

function abortError() {
  const error = new Error('路线规划已取消');
  error.name = 'AbortError';
  return error;
}

function checkAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function storagePosition(value) {
  const coordinate = Array.isArray(value)
    ? value
    : [value?.getLng?.() ?? value?.lng, value?.getLat?.() ?? value?.lat];
  if (!validRoutePosition(coordinate)) return null;
  return toStorageLngLat(Number(coordinate[0]), Number(coordinate[1]));
}

function storagePath(path) {
  const coordinates = typeof path === 'string' ? path.split(';').map((point) => point.split(',')) : path;
  return Array.isArray(coordinates) ? coordinates.map(storagePosition).filter(Boolean) : [];
}

function appendPath(target, source) {
  for (const coordinate of source) {
    const last = target[target.length - 1];
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) target.push(coordinate);
  }
  return target;
}

// Split the returned road path at the closest ordered stop, never by drawing a straight leg.
export function splitRouteAtStops(coordinates, stops) {
  if (stops.length <= 2) return [coordinates];
  const segments = [];
  let previousIndex = 0;
  for (const stop of stops.slice(1, -1)) {
    let bestIndex = previousIndex;
    let bestDistance = Infinity;
    for (let index = previousIndex; index < coordinates.length; index += 1) {
      const point = coordinates[index];
      const distance = ((point[0] - stop[0]) * Math.cos(stop[1] * Math.PI / 180)) ** 2 + (point[1] - stop[1]) ** 2;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    segments.push(coordinates.slice(previousIndex, bestIndex + 1));
    previousIndex = bestIndex;
  }
  segments.push(coordinates.slice(previousIndex));
  return segments;
}

export function normalizeAMapRoutes(result, mode, points) {
  const routes = Array.isArray(result?.routes) ? result.routes : Array.isArray(result?.rides) ? result.rides : [];
  return routes.flatMap((route, index) => {
    const rawSteps = route.steps || route.rides || [];
    const steps = rawSteps.map((step) => ({
      instruction: String(step.instruction || [step.road, step.action].filter(Boolean).join(' ')),
      distance: Number(step.distance) || 0,
      duration: Number(step.time ?? step.duration) || 0,
      road: String(step.road || ''),
      action: String(step.action || ''),
      assistAction: String(step.assist_action || step.assistAction || ''),
      path: storagePath(step.path),
    }));
    const coordinates = steps.reduce((path, step) => appendPath(path, step.path), []);
    if (coordinates.length < 2) appendPath(coordinates, storagePath(route.path));
    const distance = Number(route.distance);
    const duration = Number(route.time ?? route.duration);
    if (coordinates.length < 2 || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(duration) || duration < 0) return [];
    return [{
      id: `route-${index}`,
      mode,
      geometry: { type: 'LineString', coordinates },
      distance,
      duration,
      steps,
      segmentPaths: splitRouteAtStops(coordinates, points),
    }];
  });
}

export function combineRouteLegs(legs, mode) {
  if (!legs.length || legs.some((leg) => !leg.length)) throw new Error('途经点之间没有可用路线，请调整地点。');
  // Each combination consists only of actual service-returned legs. Bound the product for long itineraries.
  let combinations = [[]];
  for (const leg of legs) combinations = combinations.flatMap((previous) => leg.map((route) => [...previous, route])).slice(0, 32);
  const seen = new Set();
  return combinations.flatMap((routes, index) => {
    const coordinates = routes.reduce((path, route) => appendPath(path, route.geometry.coordinates), []);
    const signature = JSON.stringify(coordinates);
    if (seen.has(signature)) return [];
    seen.add(signature);
    return [{
      id: `route-${index}`,
      mode,
      geometry: { type: 'LineString', coordinates },
      distance: routes.reduce((sum, route) => sum + route.distance, 0),
      duration: routes.reduce((sum, route) => sum + route.duration, 0),
      steps: routes.flatMap((route, segmentIndex) => route.steps.map((step) => ({ ...step, segmentIndex }))),
      segmentPaths: routes.map((route) => route.geometry.coordinates),
    }];
  });
}

function pluginReady(AMap, pluginName, signal, timeoutMs) {
  checkAborted(signal);
  if (AMap[pluginName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(abortError());
    const timeout = setTimeout(() => finish(new Error('路线服务加载超时，请检查网络与高德 Key 配置。')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      AMap.plugin(`AMap.${pluginName}`, () => finish(AMap[pluginName] ? null : new Error('路线服务暂不可用。')));
    } catch (error) { finish(error); }
  });
}

function searchRoute(AMap, pluginName, points, mode, signal, timeoutMs) {
  checkAborted(signal);
  const service = new AMap[pluginName]({ hideMarkers: true, extensions: 'all' });
  const positions = points.map((point) => toDisplayLngLat(...point));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, routes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      service.clear?.();
      if (error) reject(error); else resolve(routes);
    };
    const onAbort = () => finish(abortError());
    const timeout = setTimeout(() => finish(new Error('路线规划超时，请稍后重试。')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    const callback = (status, result) => {
      if (signal?.aborted) { finish(abortError()); return; }
      const routes = status === 'complete' ? normalizeAMapRoutes(result, mode, points) : [];
      if (!routes.length) {
        finish(new Error(status === 'error' ? String(result?.info || result || '路线服务暂不可用，请检查服务权限。') : '暂未找到可用路线，请调整起点、终点或途经点。'));
      } else finish(null, routes);
    };
    try {
      if (pluginName === 'Driving' && positions.length > 2) service.search(positions[0], positions[positions.length - 1], { waypoints: positions.slice(1, -1) }, callback);
      else service.search(positions[0], positions[1], callback);
    } catch (error) { finish(error); }
  });
}

/** WGS84 in/out. AMap only sees GCJ02. Services run without a map so previews remain under React's control. */
export async function routeAMapAlternatives(points, mode = 'driving', options = {}) {
  if (!ROUTE_MODES.includes(mode)) throw new Error('不支持的出行方式。');
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_ROUTE_STOPS || points.some((point) => !validRoutePosition(point))) {
    throw new Error('请设置有效起点和终点，最多添加九个目的地（含终点）。');
  }
  const { signal, timeoutMs = 15_000, load = loadAMap } = options;
  checkAborted(signal);
  const AMap = await load();
  const pluginName = mode === 'walking' ? 'Walking' : mode === 'cycling' ? 'Riding' : 'Driving';
  await pluginReady(AMap, pluginName, signal, timeoutMs);
  checkAborted(signal);
  if (mode === 'driving' || points.length === 2) return searchRoute(AMap, pluginName, points, mode, signal, timeoutMs);
  const legs = await Promise.all(points.slice(1).map((destination, index) => searchRoute(AMap, pluginName, [points[index], destination], mode, signal, timeoutMs)));
  checkAborted(signal);
  return combineRouteLegs(legs, mode);
}

export function routeDataForSave(route, stops, selectedAlternativeIndex = 0) {
  return {
    mode: route.mode,
    stops: stops.map((stop) => ({ text: String(stop.text || ''), address: String(stop.address || ''), position: [...stop.position] })),
    selectedAlternativeIndex,
    distance: route.distance,
    duration: route.duration,
    steps: route.steps,
    segmentPaths: route.segmentPaths,
  };
}

export function formatRouteDistance(distance, lang = 'zh') {
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} ${lang === 'en' ? 'km' : '公里'}` : `${Math.round(distance)} ${lang === 'en' ? 'm' : '米'}`;
}

export function formatRouteDuration(duration, lang = 'zh') {
  const minutes = Math.max(1, Math.ceil(duration / 60));
  if (minutes < 60) return `${minutes} ${lang === 'en' ? 'min' : '分钟'}`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return lang === 'en' ? `${hours} hr${remainder ? ` ${remainder} min` : ''}` : `${hours} 小时${remainder ? ` ${remainder} 分钟` : ''}`;
}
