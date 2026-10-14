import { useCallback, useEffect, useRef, useState } from 'react';
import { getAMapPlace, searchAMapPlaces, suggestAMapPlaces } from '../../amap.js';
import {
  MAX_ROUTE_STOPS, ROUTE_MODES, formatRouteDistance, formatRouteDuration,
  parseRouteCoordinate, routeAMapAlternatives, routeDataForSave, validRoutePosition,
} from '../../routing.js';

let nextStopId = 0;
const coordinateLabel = (position) => position.map((coordinate) => Number(coordinate).toFixed(6)).join(', ');

function makeStop(value) {
  const raw = value?.position || value?.geometry?.coordinates || value;
  const position = validRoutePosition(raw) ? raw.map(Number) : raw && validRoutePosition([raw.lng, raw.lat]) ? [Number(raw.lng), Number(raw.lat)] : null;
  return {
    id: `directions-stop-${++nextStopId}`,
    text: String(value?.text || value?.name || (position ? coordinateLabel(position) : typeof value === 'string' ? value : '')),
    address: String(value?.address || ''),
    position,
  };
}

function changedStops(stops, position, segmentIndex, stopIndex) {
  if (!validRoutePosition(position)) throw new Error('请选择有效的地图位置。');
  const next = [...stops];
  const stop = makeStop(position);
  if (Number.isInteger(stopIndex) && stopIndex >= 0 && stopIndex < next.length) {
    next[stopIndex] = { ...stop, id: next[stopIndex].id };
    return next;
  }
  if (next.length >= MAX_ROUTE_STOPS) throw new Error('最多添加九个目的地（含终点）。');
  const index = Number.isInteger(segmentIndex) ? Math.max(1, Math.min(next.length - 1, segmentIndex + 1)) : next.length - 1;
  next.splice(index, 0, stop);
  return next;
}

export default function useDirections({ onPreviewChange, onSave, onError, onFocus, lang = 'zh' } = {}) {
  const [visible, setVisible] = useState(false);
  const [stops, setStops] = useState(() => [makeStop(), makeStop()]);
  const [mode, setModeState] = useState('driving');
  const [alternatives, setAlternatives] = useState([]);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [activeStopId, setActiveStopId] = useState(null);
  const [pickingStopId, setPickingStopId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);
  const callbacksRef = useRef({ onPreviewChange, onSave, onError, onFocus });
  const stopsRef = useRef(stops);
  const visibleRef = useRef(visible);
  const modeRef = useRef(mode);
  const routeRequestRef = useRef(0);
  const addressRequestRef = useRef(0);
  const savedRequestRef = useRef(new Map());
  const geolocationRequestRef = useRef(0);
  const abortRef = useRef(null);
  const viewRevisionRef = useRef(0);
  const savingRef = useRef(false);
  const selectedAlternative = alternatives.find((route) => route.id === selectedAlternativeId) || null;
  const activeStop = stops.find((stop) => stop.id === activeStopId);

  useEffect(() => { callbacksRef.current = { onPreviewChange, onSave, onError, onFocus }; }, [onPreviewChange, onSave, onError, onFocus]);
  useEffect(() => { stopsRef.current = stops; visibleRef.current = visible; modeRef.current = mode; }, [stops, visible, mode]);

  const cancelPlan = useCallback(() => {
    viewRevisionRef.current += 1;
    routeRequestRef.current += 1;
    abortRef.current?.abort();
    setAlternatives([]);
    setSelectedAlternativeId(null);
    setLoading(false);
    setError('');
  }, []);

  const replaceStops = useCallback((next) => {
    cancelPlan();
    geolocationRequestRef.current += 1;
    setLocating(false);
    stopsRef.current = next;
    setStops(next);
  }, [cancelPlan]);

  const openFrom = useCallback(({ from, to, via, mode: nextMode } = {}) => {
    const current = visibleRef.current ? stopsRef.current : [makeStop(), makeStop()];
    let next;
    if (via !== undefined) next = [makeStop(from), ...via.map(makeStop), makeStop(to)];
    else {
      next = [...current];
      if (from !== undefined) next[0] = makeStop(from);
      if (to !== undefined) next[next.length - 1] = makeStop(to);
    }
    if (next.length > MAX_ROUTE_STOPS) {
      callbacksRef.current.onError?.('最多添加九个目的地（含终点）。');
      return;
    }
    replaceStops(next);
    addressRequestRef.current += 1;
    geolocationRequestRef.current += 1;
    setSuggestions([]);
    setActiveStopId(null);
    setPickingStopId(next.find((stop) => !stop.position)?.id || null);
    if (ROUTE_MODES.includes(nextMode)) setModeState(nextMode);
    visibleRef.current = true;
    setVisible(true);
  }, [replaceStops]);

  const close = useCallback(() => {
    visibleRef.current = false;
    setVisible(false);
    cancelPlan();
    addressRequestRef.current += 1;
    geolocationRequestRef.current += 1;
    setLocating(false);
    setResolving(false);
    setActiveStopId(null);
    setPickingStopId(null);
    setSuggestions([]);
  }, [cancelPlan]);

  useEffect(() => {
    if (!visible || stops.some((stop) => !validRoutePosition(stop.position))) return undefined;
    const requestId = ++routeRequestRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      routeAMapAlternatives(stops.map((stop) => stop.position), mode, { signal: controller.signal }).then((routes) => {
        if (requestId !== routeRequestRef.current || controller.signal.aborted) return;
        setAlternatives(routes);
        setSelectedAlternativeId(routes[0].id);
        callbacksRef.current.onFocus?.(routes[0].geometry.coordinates);
      }).catch((routeError) => {
        if (requestId !== routeRequestRef.current || routeError.name === 'AbortError') return;
        setError(routeError.message);
        setAlternatives([]);
      }).finally(() => {
        if (requestId === routeRequestRef.current) setLoading(false);
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [visible, stops, mode, planRevision]);

  useEffect(() => {
    callbacksRef.current.onPreviewChange?.(visible && alternatives.length ? { alternatives, selectedAlternativeId, stops, mode } : null);
  }, [visible, alternatives, selectedAlternativeId, stops, mode]);

  useEffect(() => {
    if (!visible || !activeStop || activeStop.position || activeStop.text.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const requestId = ++addressRequestRef.current;
    const timer = setTimeout(() => {
      suggestAMapPlaces(activeStop.text.trim()).then((rows) => {
        if (requestId === addressRequestRef.current) setSuggestions(rows.slice(0, 7));
      }).catch(() => { if (requestId === addressRequestRef.current) setSuggestions([]); });
    }, 220);
    return () => { clearTimeout(timer); addressRequestRef.current += 1; };
  }, [visible, activeStop]);

  useEffect(() => () => {
    viewRevisionRef.current += 1;
    abortRef.current?.abort();
    addressRequestRef.current += 1;
    geolocationRequestRef.current += 1;
    for (const record of savedRequestRef.current.values()) record.controller.abort();
  }, []);

  const updateStopText = useCallback((id, value) => {
    addressRequestRef.current += 1;
    setResolving(false);
    let position = null;
    try { position = parseRouteCoordinate(value); } catch { /* Report invalid coordinates when the user commits the input. */ }
    replaceStops(stopsRef.current.map((stop) => stop.id === id ? { ...stop, text: value, address: '', position } : stop));
    setActiveStopId(id);
    setPickingStopId(null);
  }, [replaceStops]);

  const applyCandidate = useCallback((id, candidate) => {
    if (!validRoutePosition(candidate.position)) throw new Error('所选地点没有可用坐标，请从搜索结果中重新选择。');
    const next = stopsRef.current.map((stop) => stop.id === id ? { ...stop, text: candidate.name || candidate.text || coordinateLabel(candidate.position), address: candidate.address || '', position: candidate.position.map(Number) } : stop);
    replaceStops(next);
    setSuggestions([]);
    setActiveStopId(null);
    setPickingStopId(next.find((stop) => !stop.position)?.id || null);
    callbacksRef.current.onFocus?.([candidate.position]);
  }, [replaceStops]);

  const chooseStop = useCallback(async (id, candidate) => {
    const requestId = ++addressRequestRef.current;
    setResolving(true);
    try {
      let resolved = candidate;
      if (!validRoutePosition(resolved.position)) {
        try { resolved = await getAMapPlace(candidate.poiId || candidate.id); } catch { resolved = null; }
        if (!validRoutePosition(resolved?.position)) {
          const rows = await searchAMapPlaces(candidate.name);
          resolved = rows.find((row) => row.poiId === candidate.poiId || row.id === candidate.id) || rows.find((row) => row.name === candidate.name);
        }
      }
      if (requestId !== addressRequestRef.current || !visibleRef.current) return;
      if (!resolved) throw new Error('无法确定该地点的位置，请选择搜索结果中的具体地点。');
      applyCandidate(id, resolved);
    } catch (resolveError) {
      if (requestId === addressRequestRef.current) setError(resolveError.message);
    } finally { if (requestId === addressRequestRef.current) setResolving(false); }
  }, [applyCandidate]);

  const resolveStop = useCallback(async (id) => {
    const stop = stopsRef.current.find((item) => item.id === id);
    if (!stop || stop.position || !stop.text.trim()) return;
    const requestId = ++addressRequestRef.current;
    setResolving(true);
    setError('');
    setActiveStopId(id);
    try {
      const coordinate = parseRouteCoordinate(stop.text);
      if (coordinate) { applyCandidate(id, { position: coordinate }); return; }
      const rows = await searchAMapPlaces(stop.text.trim());
      if (requestId !== addressRequestRef.current || !visibleRef.current) return;
      if (!rows.length) throw new Error('未找到地点，请调整地址或在地图上选择位置。');
      if (rows.length === 1) applyCandidate(id, rows[0]);
      else setSuggestions(rows);
    } catch (resolveError) {
      if (requestId === addressRequestRef.current) setError(resolveError.message);
    } finally { if (requestId === addressRequestRef.current) setResolving(false); }
  }, [applyCandidate]);

  const setMode = useCallback((nextMode) => {
    if (!ROUTE_MODES.includes(nextMode) || nextMode === modeRef.current) return;
    cancelPlan();
    modeRef.current = nextMode;
    setModeState(nextMode);
  }, [cancelPlan]);

  const retry = useCallback(() => {
    if (!visibleRef.current || stopsRef.current.some((stop) => !validRoutePosition(stop.position))) return;
    cancelPlan();
    setPlanRevision((revision) => revision + 1);
  }, [cancelPlan]);

  const addStop = useCallback(() => {
    if (stopsRef.current.length >= MAX_ROUTE_STOPS) return;
    const stop = makeStop();
    replaceStops([...stopsRef.current, stop]);
    setActiveStopId(stop.id);
    setPickingStopId(stop.id);
  }, [replaceStops]);

  const removeStop = useCallback((id) => {
    if (stopsRef.current.length <= 2) return;
    replaceStops(stopsRef.current.filter((stop) => stop.id !== id));
    addressRequestRef.current += 1;
    setSuggestions([]);
    setActiveStopId(null);
    setPickingStopId(null);
  }, [replaceStops]);

  const reorderStop = useCallback((fromIndex, toIndex) => {
    const next = [...stopsRef.current];
    if (fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length || fromIndex === toIndex) return;
    const [stop] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, stop);
    replaceStops(next);
  }, [replaceStops]);

  const swapStops = useCallback(() => replaceStops([...stopsRef.current].reverse()), [replaceStops]);

  const pickPosition = useCallback((position) => {
    const point = Array.isArray(position) ? position : [position?.lng, position?.lat];
    if (!visibleRef.current || !validRoutePosition(point)) return false;
    const id = pickingStopId || stopsRef.current.find((stop) => !stop.position)?.id;
    if (!id) return false;
    addressRequestRef.current += 1;
    applyCandidate(id, { position: point.map(Number) });
    return true;
  }, [pickingStopId, applyCandidate]);

  const addWaypoint = useCallback((position, segmentIndex, stopIndex) => {
    try { replaceStops(changedStops(stopsRef.current, position, segmentIndex, stopIndex)); }
    catch (waypointError) { setError(waypointError.message); callbacksRef.current.onError?.(waypointError.message); }
  }, [replaceStops]);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { setError('当前浏览器不支持定位，请输入起点。'); return; }
    const requestId = ++geolocationRequestRef.current;
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition((location) => {
      if (requestId !== geolocationRequestRef.current || !visibleRef.current) return;
      setLocating(false);
      applyCandidate(stopsRef.current[0].id, { name: lang === 'en' ? 'Your location' : '我的位置', position: [location.coords.longitude, location.coords.latitude] });
    }, (locationError) => {
      if (requestId !== geolocationRequestRef.current) return;
      setLocating(false);
      setError(locationError.code === 1 ? '定位权限未开启，请允许定位或输入起点。' : '暂时无法获取当前位置，请输入起点。');
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
  }, [applyCandidate, lang]);

  const selectAlternative = useCallback((id) => {
    if (id === selectedAlternativeId || !alternatives.some((route) => route.id === id)) return;
    viewRevisionRef.current += 1;
    setSelectedAlternativeId(id);
  }, [selectedAlternativeId, alternatives]);

  const save = useCallback(async () => {
    if (!selectedAlternative || loading || savingRef.current || !callbacksRef.current.onSave) return;
    // The committed route is a snapshot. Editing or reopening directions while
    // this write is pending must not let its completion dismiss the new plan.
    const viewRevision = viewRevisionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError('');
    const label = mode === 'walking' ? (lang === 'en' ? 'Walking route' : '步行路线') : mode === 'cycling' ? (lang === 'en' ? 'Cycling route' : '骑行路线') : (lang === 'en' ? 'Driving route' : '驾车路线');
    try {
      await callbacksRef.current.onSave({
        name: stops[0].text && stops[stops.length - 1].text ? `${stops[0].text} → ${stops[stops.length - 1].text}` : label,
        description: `${label} · ${formatRouteDistance(selectedAlternative.distance, lang)} · ${formatRouteDuration(selectedAlternative.duration, lang)}`,
        geometry: selectedAlternative.geometry,
        style: { color: '#1a73e8', weight: 6, routeData: routeDataForSave(selectedAlternative, stops, alternatives.findIndex((route) => route.id === selectedAlternative.id)) },
      });
      if (viewRevision === viewRevisionRef.current) close();
    } catch (saveError) { if (viewRevision === viewRevisionRef.current) setError(saveError.message); }
    finally { savingRef.current = false; setSaving(false); }
  }, [selectedAlternative, loading, saving, mode, lang, stops, alternatives, close]);

  const replanSavedFeature = useCallback(async (feature, payload) => {
    const routeData = feature.style?.routeData;
    if (!routeData?.stops?.length || !ROUTE_MODES.includes(routeData.mode)) throw new Error('该路线缺少起终点信息，请重新规划。');
    const next = changedStops(routeData.stops.map(makeStop), payload.position, payload.segmentIndex, payload.stopIndex);
    const controller = new AbortController();
    const old = savedRequestRef.current.get(feature.id);
    old?.controller.abort();
    const record = { controller };
    savedRequestRef.current.set(feature.id, record);
    try {
      const routes = await routeAMapAlternatives(next.map((stop) => stop.position), routeData.mode, { signal: controller.signal });
      if (savedRequestRef.current.get(feature.id) !== record) throw Object.assign(new Error('路线规划已取消'), { name: 'AbortError' });
      const index = Math.max(0, Math.min(routes.length - 1, Number(routeData.selectedAlternativeIndex) || 0));
      const route = routes[index];
      return {
        geometry: route.geometry,
        style: { ...feature.style, routeData: routeDataForSave(route, next, index) },
        description: `${formatRouteDistance(route.distance, lang)} · ${formatRouteDuration(route.duration, lang)}`,
      };
    } finally { if (savedRequestRef.current.get(feature.id) === record) savedRequestRef.current.delete(feature.id); }
  }, [lang]);

  return {
    visible, openFrom, close, stops, mode, alternatives, selectedAlternativeId, selectedAlternative,
    loading, saving, locating, resolving, error, activeStopId, pickingStopId, suggestions,
    canRetry: Boolean(visible && error && !alternatives.length && stops.every((stop) => validRoutePosition(stop.position))), retry,
    setMode, updateStopText, resolveStop, chooseStop, addStop, removeStop, reorderStop, swapStops,
    useCurrentLocation, setPickingStop: setPickingStopId, setActiveStop: setActiveStopId, pickPosition,
    addWaypoint, selectAlternative, save, replanSavedFeature,
  };
}
