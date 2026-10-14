import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AMAP_CONFIGURED, loadAMap, toDisplayLngLat, toStorageLngLat } from '../amap.js';
import { getBaseMapConfig, normalizeBaseMapKey } from '../utils.js';
import { useI18n } from '../i18n/index.jsx';
import './editor.css';

export const AMAP_MIN_ZOOM = 2;
export const AMAP_MAX_ZOOM = 19;

const DEFAULT_COLOR = '#1a73e8';
const DEFAULT_CANDIDATE_COLOR = '#f9ab00';
const BASE_MAP_FEATURES = ['bg', 'point', 'road', 'building'];

function displayPosition(coordinates) {
  return toDisplayLngLat(coordinates[0], coordinates[1]);
}

function geometryDisplayPath(geometry) {
  if (geometry.type === 'Point') return displayPosition(geometry.coordinates);
  if (geometry.type === 'LineString') return geometry.coordinates.map(displayPosition);
  return geometry.coordinates.map((ring) => ring.map(displayPosition));
}

function storagePoint(lnglat) {
  const [lng, lat] = toStorageLngLat(lnglat.getLng(), lnglat.getLat());
  return { lng, lat };
}

function featureColor(feature, layer) {
  return feature.style?.color || layer.style?.color || DEFAULT_COLOR;
}

function pinElement(color, selected = false, candidate = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-map-pin-wrap amap-native-pin-wrap';
  wrapper.style.width = '30px';
  wrapper.style.height = '38px';
  const pin = document.createElement('span');
  pin.className = `custom-map-pin${selected ? ' selected' : ''}${candidate ? ' candidate' : ''}`;
  pin.style.setProperty('--pin-color', color);
  pin.append(document.createElement('i'));
  wrapper.append(pin);
  return wrapper;
}

function numberedPinElement(color, index, active = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-map-pin-wrap amap-native-pin-wrap';
  wrapper.style.width = '30px';
  wrapper.style.height = '38px';
  const pin = document.createElement('span');
  pin.className = `custom-map-pin candidate numbered${active ? ' selected' : ''}`;
  pin.style.setProperty('--pin-color', color);
  const label = document.createElement('span');
  label.className = 'pin-number';
  label.textContent = String(index);
  pin.append(label);
  wrapper.append(pin);
  return wrapper;
}

function overlaySignature(feature, layer, selected) {
  return JSON.stringify([
    feature.type,
    feature.name,
    feature.geometry,
    feature.style,
    layer.style,
    selected,
  ]);
}

function overlayOptions(feature, layer, selected) {
  const color = featureColor(feature, layer);
  if (feature.type === 'Point') {
    return {
      position: geometryDisplayPath(feature.geometry),
      anchor: 'bottom-center',
      content: pinElement(color, selected),
      title: feature.name,
      zIndex: selected ? 320 : 200,
      bubble: false,
    };
  }
  if (feature.type === 'LineString') {
    return {
      path: geometryDisplayPath(feature.geometry),
      strokeColor: color,
      strokeWeight: Number(feature.style?.weight) || 5,
      strokeOpacity: 0.92,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: selected ? 130 : 100,
      bubble: false,
      cursor: 'pointer',
    };
  }
  return {
    path: geometryDisplayPath(feature.geometry),
    strokeColor: color,
    strokeWeight: Number(feature.style?.weight) || 3,
    fillColor: feature.style?.fillColor || color,
    fillOpacity: feature.style?.fillOpacity ?? 0.28,
    zIndex: selected ? 120 : 90,
    bubble: false,
    cursor: 'pointer',
  };
}

function createFeatureOverlay(AMap, map, feature, layer, selected, handlers) {
  const options = overlayOptions(feature, layer, selected);
  const overlay = feature.type === 'Point'
    ? new AMap.Marker(options)
    : feature.type === 'LineString'
      ? new AMap.Polyline(options)
      : new AMap.Polygon(options);
  overlay.on('click', handlers.click);
  overlay.on('mouseover', handlers.mouseover);
  overlay.on('mousemove', handlers.mousemove);
  overlay.on('mouseout', handlers.mouseout);
  map.add(overlay);
  return overlay;
}

function updateFeatureOverlay(record, feature, layer, selected) {
  const options = overlayOptions(feature, layer, selected);
  if (feature.type === 'Point') {
    record.overlay.setPosition(options.position);
    record.overlay.setContent(options.content);
    record.overlay.setTitle(options.title);
    record.overlay.setzIndex(options.zIndex);
  } else {
    record.overlay.setPath(options.path);
    record.overlay.setOptions(options);
  }
  record.overlay.show();
}

function buildController(AMap, map, registry, reportZoom) {
  return {
    getCenter() {
      const center = map.getCenter();
      const [lng, lat] = toStorageLngLat(center.getLng(), center.getLat());
      return { lng, lat };
    },
    getZoom: () => map.getZoom(),
    setView(coordinates, zoom = map.getZoom()) {
      const position = displayPosition(coordinates);
      const nextZoom = Math.max(AMAP_MIN_ZOOM, Math.min(AMAP_MAX_ZOOM, zoom));
      map.setZoomAndCenter(nextZoom, position, true, 0);
      reportZoom();
    },
    panTo(coordinates) {
      map.setCenter(displayPosition(coordinates), true, 0);
    },
    fitPositions(positions, maxZoom = 16) {
      const points = (positions || []).filter((point) => Array.isArray(point) && point.length >= 2);
      if (!points.length) return;
      if (points.length === 1) {
        const nextZoom = Math.max(AMAP_MIN_ZOOM, Math.min(AMAP_MAX_ZOOM, maxZoom));
        map.setZoomAndCenter(nextZoom, displayPosition(points[0]), true, 0);
        reportZoom();
        return;
      }
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const point of points) {
        const [lng, lat] = displayPosition(point);
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const bounds = new AMap.Bounds(new AMap.LngLat(minLng, minLat), new AMap.LngLat(maxLng, maxLat));
      map.setBounds(bounds, true, [120, 120, 120, 120], maxZoom);
      reportZoom();
    },
    focusFeature(featureId) {
      const record = registry.current.get(featureId);
      if (!record) return;
      if (record.type === 'Point') {
        map.setCenter(record.overlay.getPosition(), true, 0);
      } else {
        map.setFitView([record.overlay], true, [80, 80, 80, 80], 18);
      }
    },
    zoomIn() {
      map.setZoom(Math.min(AMAP_MAX_ZOOM, map.getZoom() + 1), true, 0);
      reportZoom();
    },
    zoomOut() {
      map.setZoom(Math.max(AMAP_MIN_ZOOM, map.getZoom() - 1), true, 0);
      reportZoom();
    },
    resize: () => map.resize(),
    async toggleFullscreen() {
      const page = map.getContainer().closest('.editor-page, .public-map-page, .preview-editor-page') || map.getContainer();
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (page.requestFullscreen) await page.requestFullscreen();
      else throw new Error('当前浏览器不支持全屏。');
    },
    rawMap: map,
  };
}

function createBaseLayerSet(AMap, baseMapKey) {
  const satelliteVisible = getBaseMapConfig(baseMapKey).layerType === 'satellite';
  const defaultLayer = AMap.createDefaultLayer({ visible: !satelliteVisible });
  const satelliteLayer = new AMap.TileLayer.Satellite({ visible: satelliteVisible });
  const roadNetLayer = new AMap.TileLayer.RoadNet({ visible: satelliteVisible });
  return {
    all: [defaultLayer, satelliteLayer, roadNetLayer],
    defaultLayer,
    satelliteLayer,
    roadNetLayer,
  };
}

function showBaseLayerSet(layerSet, baseMapKey) {
  if (!layerSet) return;
  const satelliteVisible = getBaseMapConfig(baseMapKey).layerType === 'satellite';
  layerSet.defaultLayer[satelliteVisible ? 'hide' : 'show']();
  layerSet.satelliteLayer[satelliteVisible ? 'show' : 'hide']();
  layerSet.roadNetLayer[satelliteVisible ? 'show' : 'hide']();
}

export default function AmapMap({
  activeTool = '',
  editable = false,
  candidateColor = DEFAULT_CANDIDATE_COLOR,
  className = '',
  draftMarker = null,
  draftPoints = [],
  hoverPoint = null,
  mapData,
  markerColor = DEFAULT_COLOR,
  onCandidateClick,
  onFeatureSelect,
  onFeatureGeometryChange,
  onMapClick,
  onMapDoubleClick,
  onMouseMove,
  onMoveEnd,
  onPopupClose,
  onReady,
  onZoomStateChange,
  popup = null,
  searchCandidates = [],
  selectedFeatureId = null,
  showZoomControls = false,
  trafficVisible = false,
}) {
  const { lang, t } = useI18n();
  const text = (zh, en) => lang === 'en' ? en : zh;
  const shellRef = useRef(null);
  const surfaceRef = useRef(null);
  const amapRef = useRef(null);
  const mapRef = useRef(null);
  const baseLayersRef = useRef(null);
  const appliedBaseMapKeyRef = useRef(null);
  const controllerRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const editorRef = useRef(null);
  const editingIdRef = useRef(null);
  const dragListenersRef = useRef([]);
  const overlayRegistryRef = useRef(new Map());
  const featureLookupRef = useRef(new Map());
  const draftOverlaysRef = useRef([]);
  const candidateOverlaysRef = useRef([]);
  const candidateLookupRef = useRef(new Map());
  const tooltipRef = useRef(null);
  const tooltipElementRef = useRef(null);
  const infoWindowRef = useRef(null);
  const callbacksRef = useRef({});
  const mapDataRef = useRef(mapData);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(AMAP_CONFIGURED ? 'loading' : 'missing');
  const [errorMessage, setErrorMessage] = useState('');
  const [popupHost, setPopupHost] = useState(null);
  const [zoom, setZoom] = useState(Number(mapData.zoom) || 13);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [controlError, setControlError] = useState('');

  callbacksRef.current = {
    onCandidateClick,
    onFeatureSelect,
    onFeatureGeometryChange,
    onMapClick,
    onMapDoubleClick,
    onMouseMove,
    onMoveEnd,
    onPopupClose,
    onReady,
    onZoomStateChange,
  };
  mapDataRef.current = mapData;

  useEffect(() => {
    if (!AMAP_CONFIGURED || !surfaceRef.current || !shellRef.current) return undefined;
    let disposed = false;
    let loadTimeout;
    let resizeObserver;
    let surfaceDoubleClickHandler;
    const shell = shellRef.current;

    setStatus('loading');
    shell.dataset.amapStatus = 'loading';

    loadAMap().then((AMap) => {
      if (disposed) return;
      amapRef.current = AMap;
      const currentData = mapDataRef.current;
      const config = getBaseMapConfig(currentData.base_map);
      const options = {
        center: toDisplayLngLat(currentData.center_lng, currentData.center_lat),
        zoom: Math.max(AMAP_MIN_ZOOM, Math.min(AMAP_MAX_ZOOM, Number(currentData.zoom) || 13)),
        zooms: [AMAP_MIN_ZOOM, AMAP_MAX_ZOOM],
        mapStyle: config.mapStyle,
        features: BASE_MAP_FEATURES,
        viewMode: '2D',
        pitch: 0,
        rotation: 0,
        pitchEnable: false,
        rotateEnable: false,
        showBuildingBlock: false,
        animateEnable: false,
        dragEnable: true,
        zoomEnable: true,
        scrollWheel: true,
        touchZoom: true,
        doubleClickZoom: false,
        keyboardEnable: true,
        jogEnable: true,
        resizeEnable: true,
        showIndoorMap: false,
      };
      const baseLayers = createBaseLayerSet(AMap, currentData.base_map);
      options.layers = baseLayers.all;
      const map = new AMap.Map(surfaceRef.current, options);
      mapRef.current = map;
      baseLayersRef.current = baseLayers;
      const trafficLayer = new AMap.TileLayer.Traffic({ zIndex: 12 });
      trafficLayerRef.current = trafficLayer;
      map.add(trafficLayer);
      trafficLayer.hide();
      appliedBaseMapKeyRef.current = normalizeBaseMapKey(currentData.base_map);

      const tooltipElement = document.createElement('div');
      tooltipElement.className = 'amap-feature-tooltip';
      tooltipElementRef.current = tooltipElement;
      const tooltip = new AMap.Marker({
        content: tooltipElement,
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, -44),
        zIndex: 150,
        bubble: false,
      });
      map.add(tooltip);
      tooltip.hide();
      tooltipRef.current = tooltip;

      const host = document.createElement('div');
      host.className = 'amap-native-info-window';
      const stopMapEvent = (event) => event.stopPropagation();
      ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'touchstart'].forEach((eventName) => host.addEventListener(eventName, stopMapEvent));
      const infoWindow = new AMap.InfoWindow({
        isCustom: true,
        content: host,
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, -36),
        autoMove: true,
        closeWhenClickMap: false,
      });
      infoWindow.on('close', () => callbacksRef.current.onPopupClose?.());
      infoWindowRef.current = infoWindow;
      setPopupHost(host);

      const reportZoom = () => {
        const currentZoom = map.getZoom();
        shell.dataset.zoom = String(currentZoom);
        shell.dataset.minZoom = String(AMAP_MIN_ZOOM);
        shell.dataset.maxZoom = String(AMAP_MAX_ZOOM);
        setZoom(currentZoom);
        callbacksRef.current.onZoomStateChange?.({ zoom: currentZoom, minZoom: AMAP_MIN_ZOOM, maxZoom: AMAP_MAX_ZOOM });
      };
      controllerRef.current = buildController(AMap, map, overlayRegistryRef, reportZoom);

      map.on('complete', () => {
        if (disposed) return;
        window.clearTimeout(loadTimeout);
        shell.dataset.amapStatus = 'ready';
        setStatus('ready');
        reportZoom();
        callbacksRef.current.onReady?.(controllerRef.current);
      });
      map.on('zoomend', reportZoom);
      map.on('moveend', () => callbacksRef.current.onMoveEnd?.(controllerRef.current.getCenter(), map.getZoom()));
      map.on('click', (event) => callbacksRef.current.onMapClick?.(storagePoint(event.lnglat), event.originEvent || event.originalEvent));
      map.on('mousemove', (event) => callbacksRef.current.onMouseMove?.(storagePoint(event.lnglat)));
      map.on('mouseout', () => callbacksRef.current.onMouseMove?.(null));

      // AMap stops emitting its map-level dblclick event when double-click zoom is
      // disabled. Listen on the native map surface so drawing can still finish
      // without re-enabling a zoom gesture that would move the final vertex.
      surfaceDoubleClickHandler = (event) => {
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (!rect) return;
        const position = map.containerToLngLat(new AMap.Pixel(event.clientX - rect.left, event.clientY - rect.top));
        callbacksRef.current.onMapDoubleClick?.(storagePoint(position), event);
      };
      surfaceRef.current.addEventListener('dblclick', surfaceDoubleClickHandler, true);

      resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.resize());
      resizeObserver?.observe(shell);
      setReady(true);
      loadTimeout = window.setTimeout(() => {
        if (disposed || shell.dataset.amapStatus === 'ready') return;
        shell.dataset.amapStatus = 'error';
        setStatus('error');
        setErrorMessage('加载超时，请检查 Key、安全密钥和域名白名单。');
      }, 12_000);
    }).catch((error) => {
      if (disposed) return;
      shell.dataset.amapStatus = 'error';
      setStatus('error');
      setErrorMessage(error?.message || '高德地图脚本加载失败。');
    });

    return () => {
      disposed = true;
      window.clearTimeout(loadTimeout);
      resizeObserver?.disconnect();
      if (surfaceDoubleClickHandler) surfaceRef.current?.removeEventListener('dblclick', surfaceDoubleClickHandler, true);
      infoWindowRef.current?.close();
      editorRef.current?.close();
      editorRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      trafficLayerRef.current = null;
      baseLayersRef.current = null;
      appliedBaseMapKeyRef.current = null;
      controllerRef.current = null;
      amapRef.current = null;
      overlayRegistryRef.current.clear();
      featureLookupRef.current.clear();
      draftOverlaysRef.current = [];
      candidateOverlaysRef.current = [];
      candidateLookupRef.current.clear();
      tooltipRef.current = null;
      tooltipElementRef.current = null;
      infoWindowRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    if (!ready) return;
    trafficLayerRef.current?.[trafficVisible ? 'show' : 'hide']();
  }, [ready, trafficVisible]);

  const baseMapKey = normalizeBaseMapKey(mapData.base_map);
  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return;
    if (appliedBaseMapKeyRef.current === baseMapKey) return;

    const config = getBaseMapConfig(baseMapKey);
    mapRef.current.setMapStyle(config.mapStyle);
    // All three official layers are attached during map construction. Toggling
    // their visibility preserves AMap's internal road/POI label resources;
    // setLayers() or late add/remove calls drop those labels in JS API 2.0.
    showBaseLayerSet(baseLayersRef.current, baseMapKey);
    appliedBaseMapKeyRef.current = baseMapKey;
  }, [baseMapKey, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return;
    const map = mapRef.current;
    const AMap = amapRef.current;
    const nextLookup = new Map();
    for (const layer of mapData.layers) {
      if (!layer.visible) continue;
      for (const feature of layer.features) nextLookup.set(feature.id, { feature, layer });
    }
    featureLookupRef.current = nextLookup;

    for (const [featureId, context] of nextLookup) {
      const { feature, layer } = context;
      const selected = featureId === selectedFeatureId;
      const signature = overlaySignature(feature, layer, selected);
      let record = overlayRegistryRef.current.get(featureId);
      if (record && record.type !== feature.type) {
        map.remove(record.overlay);
        overlayRegistryRef.current.delete(featureId);
        record = null;
      }
      if (!record) {
        const showTooltip = (event) => {
          tooltipElementRef.current.textContent = featureLookupRef.current.get(featureId)?.feature.name || '';
          // Anchor the tooltip at the overlay's own position, not at the cursor.
          // A cursor-chasing tooltip slides under the pointer during a click and
          // splits AMap's mousedown/mouseup hit-test across two markers, so the
          // feature click never fires — the classic "click after hover is dead".
          const overlayPos = record?.overlay?.getPosition?.();
          tooltipRef.current.setPosition(overlayPos || event?.lnglat || record?.overlay?.getPosition?.());
          tooltipRef.current.show();
        };
        const overlay = createFeatureOverlay(AMap, map, feature, layer, selected, {
          click: () => {
            tooltipRef.current?.hide();
            const latest = featureLookupRef.current.get(featureId);
            if (latest) callbacksRef.current.onFeatureSelect?.(latest.feature, latest.layer);
          },
          mouseover: showTooltip,
          mousemove: showTooltip,
          mouseout: () => tooltipRef.current?.hide(),
        });
        record = { overlay, signature, type: feature.type };
        overlayRegistryRef.current.set(featureId, record);
      } else if (record.signature !== signature) {
        updateFeatureOverlay(record, feature, layer, selected);
        record.signature = signature;
      }
    }

    for (const [featureId, record] of overlayRegistryRef.current) {
      if (nextLookup.has(featureId)) continue;
      map.remove(record.overlay);
      overlayRegistryRef.current.delete(featureId);
    }
  }, [mapData, ready, selectedFeatureId]);

  // Only the selected feature is editable. End events persist one WGS84
  // geometry update, so moving a vertex never creates a stream of writes.
  const selectedGeometry = JSON.stringify(mapData.layers.flatMap((layer) => layer.visible ? layer.features : []).find((feature) => feature.id === selectedFeatureId)?.geometry);
  useEffect(() => {
    editorRef.current?.close();
    editorRef.current = null;
    editingIdRef.current = null;
    for (const { overlay, handler } of dragListenersRef.current) overlay.off('dragend', handler);
    dragListenersRef.current = [];
    for (const record of overlayRegistryRef.current.values()) if (record.type === 'Point') record.overlay.setDraggable(false);
    if (!ready || !editable || activeTool !== 'pan') return undefined;
    const record = overlayRegistryRef.current.get(selectedFeatureId);
    if (!record) return undefined;
    let disposed = false;
    editingIdRef.current = selectedFeatureId;
    const saveGeometry = () => {
      const context = featureLookupRef.current.get(selectedFeatureId);
      if (!context || disposed) return;
      let geometry;
      if (record.type === 'Point') {
        const point = storagePoint(record.overlay.getPosition());
        geometry = { type: 'Point', coordinates: [point.lng, point.lat] };
      } else {
        const toPoint = (point) => {
          const stored = storagePoint(point);
          return [stored.lng, stored.lat];
        };
        const path = record.overlay.getPath();
        if (record.type === 'LineString') geometry = { type: 'LineString', coordinates: path.map(toPoint) };
        else {
          const rings = Array.isArray(path[0]) ? path : [path];
          geometry = { type: 'Polygon', coordinates: rings.map((ring) => {
            const points = ring.map(toPoint);
            const first = points[0];
            const last = points.at(-1);
            return first && (first[0] !== last[0] || first[1] !== last[1]) ? [...points, first] : points;
          }) };
        }
      }
      if (JSON.stringify(geometry) !== JSON.stringify(context.feature.geometry)) callbacksRef.current.onFeatureGeometryChange?.(context.feature, geometry, context.layer);
    };
    if (record.type === 'Point') {
      record.overlay.setDraggable(true);
      record.overlay.on('dragend', saveGeometry);
      dragListenersRef.current.push({ overlay: record.overlay, handler: saveGeometry });
    } else {
      const pluginName = record.type === 'Polygon' ? 'PolygonEditor' : 'PolylineEditor';
      amapRef.current.plugin(`AMap.${pluginName}`, () => {
        if (disposed || !mapRef.current || editingIdRef.current !== selectedFeatureId) return;
        const editor = new amapRef.current[pluginName](mapRef.current, record.overlay);
        editorRef.current = editor;
        ['adjust', 'addnode', 'removenode', 'move'].forEach((event) => editor.on(event, saveGeometry));
        editor.open();
      });
    }
    return () => {
      disposed = true;
      editorRef.current?.close();
      editorRef.current = null;
      if (record.type === 'Point') { record.overlay.off('dragend', saveGeometry); record.overlay.setDraggable(false); }
    };
  }, [activeTool, editable, ready, selectedFeatureId, selectedGeometry]);

  // Search candidates render as numbered amber pins (1..N) so the user can
  // cross-reference them with the sequence strip under the search box. They
  // live outside the feature overlay registry so they never persist or get
  // selected; clicking one delegates to the parent's onCandidateClick.
  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return;
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (candidateOverlaysRef.current.length) map.remove(candidateOverlaysRef.current);
    candidateOverlaysRef.current = [];
    candidateLookupRef.current = new Map();

    const overlays = searchCandidates
      .filter((candidate) => candidate && Array.isArray(candidate.position) && candidate.position.length >= 2)
      .map((candidate) => {
        const marker = new AMap.Marker({
          position: displayPosition(candidate.position),
          anchor: 'bottom-center',
          content: numberedPinElement(candidateColor, candidate.index, candidate.active),
          title: candidate.name || '',
          zIndex: candidate.active ? 320 : 240,
          bubble: false,
        });
        marker.on('click', () => callbacksRef.current.onCandidateClick?.(candidate));
        candidateLookupRef.current.set(candidate.id, candidate);
        map.add(marker);
        return marker;
      });
    candidateOverlaysRef.current = overlays;

    return () => {
      if (mapRef.current && overlays.length) mapRef.current.remove(overlays);
      if (candidateOverlaysRef.current === overlays) candidateOverlaysRef.current = [];
    };
  }, [searchCandidates, candidateColor, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current || !shellRef.current) return;
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (draftOverlaysRef.current.length) map.remove(draftOverlaysRef.current);
    const overlays = [];
    const draftColor = activeTool === 'route' ? '#1a73e8' : activeTool === 'polygon' ? '#00897b' : activeTool === 'measure' ? '#3c4043' : '#e85d4a';
    const livePoints = draftPoints.length && hoverPoint ? [...draftPoints, hoverPoint] : draftPoints;
    const livePath = livePoints.map(displayPosition);

    if (livePath.length >= 2) {
      overlays.push(new AMap.Polyline({ path: livePath, strokeColor: draftColor, strokeWeight: 4, strokeOpacity: 0.92, strokeStyle: 'dashed', lineJoin: 'round', lineCap: 'round', zIndex: 500, bubble: true, cursor: 'crosshair' }));
    }
    if (activeTool === 'polygon' && livePath.length >= 3) {
      overlays.push(new AMap.Polygon({ path: livePath, strokeOpacity: 0, fillColor: '#4db6ac', fillOpacity: 0.16, zIndex: 490, bubble: true, cursor: 'crosshair' }));
    }
    for (const point of draftPoints) {
      overlays.push(new AMap.CircleMarker({ center: displayPosition(point), radius: 6, strokeColor: draftColor, strokeWeight: 2, fillColor: '#fff', fillOpacity: 1, zIndex: 520, bubble: true, cursor: 'crosshair' }));
    }
    if (draftPoints.length && hoverPoint) {
      overlays.push(new AMap.CircleMarker({ center: displayPosition(hoverPoint), radius: 4, strokeColor: '#fff', strokeWeight: 1.5, fillColor: draftColor, fillOpacity: 1, zIndex: 521, bubble: true, cursor: 'crosshair' }));
    }
    if (activeTool === 'marker' && hoverPoint) {
      overlays.push(new AMap.Marker({ position: displayPosition(hoverPoint), anchor: 'bottom-center', content: pinElement(markerColor), opacity: 0.62, zIndex: 530, bubble: true, cursor: 'crosshair' }));
    }
    if (draftMarker) {
      overlays.push(new AMap.Marker({ position: displayPosition(draftMarker.position), anchor: 'bottom-center', content: pinElement(draftMarker.color || DEFAULT_COLOR, true), zIndex: 540, bubble: true }));
    }
    if (overlays.length) map.add(overlays);
    draftOverlaysRef.current = overlays;
    shellRef.current.dataset.drawTool = activeTool === 'pan' ? '' : activeTool;
    const drawing = activeTool && activeTool !== 'pan';
    map.setDefaultCursor(drawing ? 'crosshair' : 'grab');
    map.setStatus({ dragEnable: !drawing, doubleClickZoom: !drawing });

    return () => {
      if (mapRef.current && overlays.length) mapRef.current.remove(overlays);
      if (draftOverlaysRef.current === overlays) draftOverlaysRef.current = [];
    };
  }, [activeTool, draftMarker, draftPoints, hoverPoint, markerColor, ready]);

  const popupLng = popup?.position?.[0];
  const popupLat = popup?.position?.[1];
  useEffect(() => {
    if (!ready || !mapRef.current || !infoWindowRef.current) return;
    if (!Number.isFinite(popupLng) || !Number.isFinite(popupLat)) {
      infoWindowRef.current.close();
      return;
    }
    infoWindowRef.current.open(mapRef.current, toDisplayLngLat(popupLng, popupLat));
  }, [popupLat, popupLng, ready]);

  const popupPortal = useMemo(() => (
    popupHost && popup?.content ? createPortal(popup.content, popupHost) : null
  ), [popup?.content, popupHost]);

  const locateUser = () => {
    setControlError('');
    if (!navigator.geolocation) { setControlError(text('当前浏览器不支持定位。', 'Geolocation is unavailable.')); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => controllerRef.current?.setView([coords.longitude, coords.latitude], 16), () => setControlError(text('无法获取位置，请检查定位权限。', 'Unable to locate you. Check location permissions.')));
  };

  return (
    <div ref={shellRef} className={`amap-map-shell ${className}`.trim()} data-amap-status={status}>
      <div ref={surfaceRef} className="amap-map-surface" aria-label={text('高德地图', 'AMap')} />
      {status === 'loading' ? <div className="basemap-loading-notice" role="status">{text('正在加载高德地图…', 'Loading AMap…')}</div> : null}
      {status === 'missing' ? (
        <div className="basemap-config-notice" role="alert" data-testid="amap-key-notice">
          <strong>{text('高德地图尚未配置', 'Set up your AMap')}</strong>
          <span>{text('请在 .env.local 中设置 VITE_AMAP_KEY 与安全密钥，然后重启应用。', 'Set VITE_AMAP_KEY and its security code in .env.local, then restart the app.')}</span>
          <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer">{text('配置高德 Key', 'Configure AMap key')}</a>
        </div>
      ) : null}
      {status === 'error' ? <div className="basemap-config-notice error" role="alert"><strong>{text('高德地图加载失败', 'Unable to load AMap')}</strong><span>{errorMessage}</span></div> : null}
      {showZoomControls ? (
        <div className="amap-native-zoom-controls" aria-label={text('地图控件', 'Map controls')}>
          <button type="button" aria-label={text('全屏', 'Fullscreen')} onClick={() => controllerRef.current?.toggleFullscreen().catch((error) => setControlError(error.message))}>{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          <button type="button" aria-label={t('editor.locate')} onClick={locateUser}><LocateFixed size={20} /></button>
          <button type="button" aria-label={t('editor.zoomIn')} disabled={!ready || zoom >= AMAP_MAX_ZOOM} onClick={() => controllerRef.current?.zoomIn()}><ZoomIn size={20} /></button>
          <button type="button" aria-label={t('editor.zoomOut')} disabled={!ready || zoom <= AMAP_MIN_ZOOM} onClick={() => controllerRef.current?.zoomOut()}><ZoomOut size={20} /></button>
        </div>
      ) : null}
      {controlError ? <button className="map-control-error" role="alert" onClick={() => setControlError('')}>{controlError}</button> : null}
      {popupPortal}
    </div>
  );
}
