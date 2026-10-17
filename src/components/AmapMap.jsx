import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AMAP_CONFIGURED, loadAMap, toDisplayLngLat, toStorageLngLat } from '../amap.js';
import { getBaseMapConfig, normalizeBaseMapKey } from '../utils.js';
import { useI18n } from '../i18n/index.jsx';
import { nearestRouteSegment, geometryCoordinates, safeStorageBounds, viewportPadding } from './map-engine-utils.js';
import './editor.css';

export const AMAP_MIN_ZOOM = 2;
export const AMAP_MAX_ZOOM = 19;

const DEFAULT_COLOR = '#1a73e8';
const DEFAULT_CANDIDATE_COLOR = '#f9ab00';
const BASE_MAP_FEATURES = ['bg', 'point', 'road', 'building'];
const MARKER_ICONS = new Set(['pin', 'circle', 'star', 'flag', 'home', 'food']);
const MARKER_ICON_PATHS = {
  star: ['m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.9 9.7l6.3-.9Z'],
  flag: ['M5 21V4', 'M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0'],
  home: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-8h6v8'],
  food: ['M4 3v5a3 3 0 0 0 6 0V3', 'M7 3v19', 'M20 3c-4 2-5 6-5 9h5', 'M20 3v19'],
};

function displayPosition(coordinates) {
  return toDisplayLngLat(coordinates[0], coordinates[1]);
}

function geometryDisplayPath(geometry) {
  if (geometry.type === 'Point') return displayPosition(geometry.coordinates);
  if (geometry.type === 'LineString') return geometry.coordinates.map(displayPosition);
  return geometry.coordinates.map((ring) => ring.map(displayPosition));
}

function storagePoint(lnglat) {
  const position = typeof lnglat === 'string' ? lnglat.split(',').map(Number) : lnglat;
  const [lng, lat] = toStorageLngLat(position?.getLng?.() ?? position?.lng ?? position?.[0], position?.getLat?.() ?? position?.lat ?? position?.[1]);
  return { lng, lat };
}

function handleElement(color, label, kind, index) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'map-engine-handle';
  element.dataset.mapHandle = kind;
  if (kind === 'measurement') element.dataset.measurementIndex = String(index);
  else element.dataset.routeHandleIndex = String(index);
  element.setAttribute('aria-label', label);
  element.title = label;
  Object.assign(element.style, {
    width: '20px', height: '20px', padding: '0', display: 'grid', placeItems: 'center',
    borderRadius: '50%', background: '#fff', border: `3px solid ${color}`, color,
    boxShadow: '0 1px 5px rgba(0,0,0,.24)', cursor: 'grab', touchAction: 'none',
  });
  return element;
}

function validPosition(position) {
  const coordinates = position?.position || position;
  return Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(Number.isFinite) ? coordinates : null;
}

function routeHandlePositions(plan) {
  const path = geometryCoordinates(plan?.geometry);
  if (path.length < 2) return [];
  const stops = (plan.stops || []).map(validPosition).filter(Boolean);
  const handles = stops.map((position, stopIndex) => ({ position, stopIndex, segmentIndex: Math.min(Math.max(0, stopIndex - 1), Math.max(0, stops.length - 2)) }));
  const segmentPaths = plan.segmentPaths;
  const count = Math.max(1, stops.length - 1);
  for (let segmentIndex = 0; segmentIndex < count; segmentIndex += 1) {
    let segment = segmentPaths?.[segmentIndex];
    if (!Array.isArray(segment) || segment.length < 2) {
      const start = stops[segmentIndex] ? nearestRouteSegment(path, stops[segmentIndex])?.pathIndex || 0 : 0;
      const end = stops[segmentIndex + 1] ? nearestRouteSegment(path, stops[segmentIndex + 1])?.pathIndex ?? path.length - 2 : path.length - 2;
      segment = path.slice(Math.min(start, end), Math.min(path.length, Math.max(start, end) + 2));
    }
    if (segment.length < 2) continue;
    // A stable white handle on each route segment can be dragged into a new
    // waypoint. The service path itself remains untouched until it is replanned.
    const middle = Math.max(0, Math.floor((segment.length - 1) / 2));
    const a = segment[middle];
    const b = segment[Math.min(middle + 1, segment.length - 1)];
    handles.push({ position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], segmentIndex });
  }
  return handles;
}

function featureColor(feature, layer) {
  return feature.style?.color || layer.style?.color || DEFAULT_COLOR;
}

function featureIcon(feature, layer) {
  return [feature.style?.icon, layer.style?.icon, 'pin'].find((icon) => MARKER_ICONS.has(icon));
}

function styleNumber(feature, layer, field, defaultValue, min, max) {
  for (const value of [feature.style?.[field], layer.style?.[field], defaultValue]) {
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return Math.min(max, Math.max(min, number));
  }
  return defaultValue;
}

function pinElement(color, selected = false, candidate = false, iconValue = 'pin') {
  const icon = MARKER_ICONS.has(iconValue) ? iconValue : 'pin';
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-map-pin-wrap amap-native-pin-wrap';
  wrapper.style.width = '30px';
  wrapper.style.height = '38px';
  wrapper.dataset.markerIcon = icon;
  const pin = document.createElement('span');
  pin.className = `custom-map-pin${selected ? ' selected' : ''}${candidate ? ' candidate' : ''}`;
  pin.style.setProperty('--pin-color', color);
  if (icon === 'pin') pin.append(document.createElement('i'));
  else {
    pin.style.borderRadius = '50%';
    pin.style.transform = selected ? 'scale(1.24)' : 'none';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.markerIconGlyph = icon;
    Object.assign(svg.style, { width: '16px', height: '16px', position: 'absolute', left: '2px', top: '2px' });
    if (icon === 'circle') {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '4'); circle.setAttribute('fill', '#fff');
      svg.append(circle);
    } else {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#fff');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      for (const pathValue of MARKER_ICON_PATHS[icon]) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathValue);
        svg.append(path);
      }
    }
    pin.append(svg);
  }
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
      content: pinElement(color, selected, false, featureIcon(feature, layer)),
      title: feature.name,
      opacity: styleNumber(feature, layer, 'opacity', 1, 0, 1),
      zIndex: selected ? 320 : 200,
      bubble: false,
    };
  }
  if (feature.type === 'LineString') {
    return {
      path: geometryDisplayPath(feature.geometry),
      strokeColor: color,
      strokeWeight: styleNumber(feature, layer, 'weight', 5, 0, 48),
      strokeOpacity: styleNumber(feature, layer, 'opacity', .92, 0, 1),
      isOutline: Boolean(feature.style?.isOutline),
      outlineColor: feature.style?.outlineColor || '#FFFFFF',
      borderWeight: styleNumber(feature, layer, 'borderWeight', 1, 0, 8),
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
    strokeWeight: styleNumber(feature, layer, 'weight', 3, 0, 48),
    strokeOpacity: styleNumber(feature, layer, 'opacity', .92, 0, 1),
    fillColor: feature.style?.fillColor || layer.style?.fillColor || color,
    fillOpacity: styleNumber(feature, layer, 'fillOpacity', .28, 0, 1),
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
    if (record.overlay.setOpacity) record.overlay.setOpacity(options.opacity);
    else record.overlay.setOptions?.({ opacity: options.opacity });
  } else {
    record.overlay.setPath(options.path);
    record.overlay.setOptions(options);
  }
  record.overlay.show();
}

function buildController(AMap, map, registry, reportZoom, options = {}) {
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const motion = () => ({ immediately: Boolean(reducedMotion()), duration: reducedMotion() ? 0 : 350 });
  const beginMove = () => options.beforeMove?.();
  const paddedPan = (position, immediate = false) => {
    const { immediately, duration } = immediate ? { immediately: true, duration: 0 } : motion();
    const padding = viewportPadding(map.getContainer());
    // Shift the requested point into the visible map area rather than beneath
    // the left drawer or the mobile details sheet.
    const pixel = map.lngLatToContainer?.(position);
    if (pixel && map.containerToLngLat) {
      const adjusted = new AMap.Pixel(pixel.x - (padding[2] - padding[3]) / 2, pixel.y - (padding[0] - padding[1]) / 2);
      map.setCenter(map.containerToLngLat(adjusted), immediately, duration);
    } else map.setCenter(position, immediately, duration);
  };
  return {
    getCenter() {
      const center = map.getCenter();
      const [lng, lat] = toStorageLngLat(center.getLng(), center.getLat());
      return { lng, lat };
    },
    getZoom: () => map.getZoom(),
    getBounds: () => safeStorageBounds(map.getBounds?.(), toStorageLngLat),
    getScreenPosition(coordinates) {
      const pixel = map.lngLatToContainer?.(displayPosition(coordinates));
      const rect = map.getContainer().getBoundingClientRect();
      return pixel ? { x: rect.left + pixel.x, y: rect.top + pixel.y } : null;
    },
    setView(coordinates, zoom = map.getZoom()) {
      beginMove();
      const position = displayPosition(coordinates);
      const nextZoom = Math.max(AMAP_MIN_ZOOM, Math.min(AMAP_MAX_ZOOM, zoom));
      const { immediately, duration } = motion();
      map.setZoomAndCenter(nextZoom, position, immediately, duration);
      reportZoom();
    },
    panTo(coordinates) {
      beginMove();
      paddedPan(displayPosition(coordinates));
    },
    panBy(x, y) {
      beginMove();
      const { duration } = motion();
      if (map.panBy) map.panBy(x, y, duration);
      else {
        const rect = map.getContainer().getBoundingClientRect();
        const center = map.containerToLngLat(new AMap.Pixel(rect.width / 2 - x, rect.height / 2 - y));
        map.setCenter(center, duration === 0, duration);
      }
    },
    fitPositions(positions, maxZoom = 16) {
      const points = (positions || []).filter((point) => Array.isArray(point) && point.length >= 2);
      if (!points.length) return;
      beginMove();
      if (points.length === 1) {
        const nextZoom = Math.max(AMAP_MIN_ZOOM, Math.min(AMAP_MAX_ZOOM, maxZoom));
        const { immediately, duration } = motion();
        map.setZoomAndCenter(nextZoom, displayPosition(points[0]), immediately, duration);
        paddedPan(displayPosition(points[0]));
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
      const padding = viewportPadding(map.getContainer());
      // setBounds accepts only bounds, immediately, and avoidance. Its fourth
      // argument does not enforce maxZoom in the real JSAPI 2.0 SDK.
      if (map.getFitZoomAndCenterByBounds) {
        const [fitZoom, center] = map.getFitZoomAndCenterByBounds(bounds, padding, maxZoom);
        const { immediately, duration } = motion();
        map.setZoomAndCenter(Math.max(AMAP_MIN_ZOOM, Math.min(AMAP_MAX_ZOOM, maxZoom, fitZoom)), center, immediately, duration);
      } else {
        // Older SDKs expose the equivalent maxZoom argument on setFitView.
        const helper = new AMap.Polyline({ path: [bounds.getSouthWest?.() || [minLng, minLat], bounds.getNorthEast?.() || [maxLng, maxLat]], strokeOpacity: 0, bubble: true });
        map.add(helper);
        map.setFitView([helper], Boolean(reducedMotion()), padding, maxZoom);
        map.remove(helper);
      }
      reportZoom();
    },
    focusFeature(featureId, { immediate = false } = {}) {
      const record = registry.current.get(featureId);
      if (!record) return;
      beginMove();
      if (record.type === 'Point') {
        paddedPan(record.overlay.getPosition(), immediate);
      } else {
        map.setFitView([record.overlay], immediate || Boolean(reducedMotion()), viewportPadding(map.getContainer()), 18);
      }
    },
    zoomIn() {
      beginMove();
      const { immediately, duration } = motion();
      map.setZoom(Math.min(AMAP_MAX_ZOOM, map.getZoom() + 1), immediately, duration);
      reportZoom();
    },
    zoomOut() {
      beginMove();
      const { immediately, duration } = motion();
      map.setZoom(Math.max(AMAP_MIN_ZOOM, map.getZoom() - 1), immediately, duration);
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
  const defaultLayer = AMap.createDefaultLayer();
  const satelliteLayer = new AMap.TileLayer.Satellite();
  const roadNetLayer = new AMap.TileLayer.RoadNet();
  return {
    all: [defaultLayer, satelliteLayer, roadNetLayer],
    active: satelliteVisible ? [satelliteLayer, roadNetLayer] : [defaultLayer],
    primary: satelliteVisible ? satelliteLayer : defaultLayer,
    defaultLayer,
    satelliteLayer,
    roadNetLayer,
  };
}

function showBaseLayerSet(map, layerSet, baseMapKey) {
  if (!layerSet) return;
  const satelliteVisible = getBaseMapConfig(baseMapKey).layerType === 'satellite';
  const next = satelliteVisible ? [layerSet.satelliteLayer, layerSet.roadNetLayer] : [layerSet.defaultLayer];
  const remove = layerSet.active.filter((layer) => !next.includes(layer));
  const add = next.filter((layer) => !layerSet.active.includes(layer));
  if (remove.length) map.remove(remove);
  if (add.length) map.add(add);
  layerSet.active = next;
  layerSet.primary = satelliteVisible ? layerSet.satelliteLayer : layerSet.defaultLayer;
}

export default function AmapMap({
  thumbnail = false,
  activeTool = '',
  editable = false,
  candidateColor = DEFAULT_CANDIDATE_COLOR,
  className = '',
  draftMarker = null,
  draftPoints = [],
  hoverPoint = null,
  mapData,
  markerColor = DEFAULT_COLOR,
  markerIcon = 'pin',
  measurementPoints = [],
  measurementClosed = false,
  onCandidateClick,
  onContextMenu,
  onPoiSelect,
  poiEnabled = true,
  quietBasemap = false,
  onViewChange,
  onMeasurementChange,
  onRouteSelect,
  onRouteWaypoint,
  onSavedRouteWaypoint,
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
  routeAlternatives = [],
  routePlan = null,
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
  const trafficAttachedRef = useRef(false);
  const editorRef = useRef(null);
  const editingIdRef = useRef(null);
  const dragListenersRef = useRef([]);
  const overlayRegistryRef = useRef(new Map());
  const featureLookupRef = useRef(new Map());
  const draftOverlaysRef = useRef([]);
  const candidateOverlaysRef = useRef([]);
  const measurementOverlaysRef = useRef([]);
  const routeOverlaysRef = useRef([]);
  const measurementPointsRef = useRef(measurementPoints);
  const candidateLookupRef = useRef(new Map());
  const tooltipRef = useRef(null);
  const tooltipElementRef = useRef(null);
  const infoWindowRef = useRef(null);
  const popupOpenRef = useRef(false);
  const programmaticPopupRef = useRef(false);
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
    onContextMenu,
    onPoiSelect,
    poiEnabled,
    onViewChange,
    onMeasurementChange,
    onRouteSelect,
    onRouteWaypoint,
    onSavedRouteWaypoint,
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
  measurementPointsRef.current = measurementPoints;

  useEffect(() => {
    if (!AMAP_CONFIGURED || !surfaceRef.current || !shellRef.current) return undefined;
    let disposed = false;
    let loadTimeout;
    let resizeObserver;
    let surfaceDoubleClickHandler;
    let removeSurfaceListeners = () => {};
    let viewFrame;
    let pressTimer;
    let pressOrigin = null;
    let pressHandled = false;
    let baseLayerCompleted = false;
    let markReady = null;
    let readyNotified = false;
    const touchPointers = new Set();
    let suppressClickUntil = 0;
    let viewSource = 'programmatic';
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
        features: quietBasemap ? ['bg', 'road'] : BASE_MAP_FEATURES,
        viewMode: '2D',
        pitch: 0,
        rotation: 0,
        pitchEnable: false,
        rotateEnable: false,
        showBuildingBlock: false,
        animateEnable: !thumbnail && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        dragEnable: !thumbnail,
        zoomEnable: !thumbnail,
        scrollWheel: !thumbnail,
        touchZoom: !thumbnail,
        doubleClickZoom: false,
        keyboardEnable: !thumbnail,
        jogEnable: !thumbnail,
        resizeEnable: true,
        showIndoorMap: false,
        isHotspot: !thumbnail && !quietBasemap,
      };
      const baseLayers = createBaseLayerSet(AMap, currentData.base_map);
      // AMap 2.0 waits forever for Map.complete when non-visible satellite or
      // road layers are attached. Only attach the currently visible base set.
      options.layers = baseLayers.active;
      const onBaseComplete = () => {
        baseLayerCompleted = true;
        markReady?.();
      };
      baseLayers.primary.on?.('complete', onBaseComplete);
      const map = new AMap.Map(surfaceRef.current, options);
      mapRef.current = map;
      baseLayersRef.current = baseLayers;
      trafficAttachedRef.current = false;
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
      infoWindow.on('close', () => {
        if (disposed || programmaticPopupRef.current || !popupOpenRef.current || infoWindow.getIsOpen?.()) return;
        popupOpenRef.current = false;
        callbacksRef.current.onPopupClose?.();
      });
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
      const reportView = () => {
        if (viewFrame) window.cancelAnimationFrame(viewFrame);
        viewFrame = window.requestAnimationFrame(() => {
          viewFrame = null;
          if (disposed) return;
          callbacksRef.current.onViewChange?.({
            center: controllerRef.current.getCenter(),
            bounds: controllerRef.current.getBounds(),
            zoom: map.getZoom(),
            source: viewSource,
          });
          viewSource = 'user';
        });
      };
      controllerRef.current = buildController(AMap, map, overlayRegistryRef, reportZoom, { beforeMove: () => { viewSource = 'programmatic'; } });

      markReady = () => {
        if (disposed || readyNotified) return;
        readyNotified = true;
        window.clearTimeout(loadTimeout);
        shell.dataset.amapStatus = 'ready';
        setStatus('ready');
        reportZoom();
        callbacksRef.current.onReady?.(controllerRef.current);
        reportView();
      };
      map.on('complete', markReady);
      if (baseLayerCompleted) markReady();
      map.on('zoomend', () => { reportZoom(); reportView(); });
      map.on('moveend', () => { callbacksRef.current.onMoveEnd?.(controllerRef.current.getCenter(), map.getZoom()); reportView(); });
      map.on('dragstart', () => { viewSource = 'user'; });
      map.on('click', (event) => {
        if (Date.now() < suppressClickUntil || event?.originEvent?.target?.closest?.('.map-engine-handle')) return;
        callbacksRef.current.onMapClick?.(storagePoint(event.lnglat), event.originEvent || event.originalEvent);
      });
      map.on('hotspotclick', (event) => {
        // The same native click can also place a drawing point. Do not let
        // its POI event suppress that click or replace an active editing flow.
        if (!callbacksRef.current.poiEnabled) return;
        const poi = event?.poi || event?.hotspot || event;
        const position = poi?.lnglat || poi?.location || event?.lnglat;
        if (!position) return;
        const point = storagePoint(position);
        if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return;
        suppressClickUntil = Date.now() + 150;
        callbacksRef.current.onPoiSelect?.({ id: poi.id || poi.poiid || '', name: poi.name || '', position: [point.lng, point.lat], nativePoi: poi });
      });
      map.on('mousemove', (event) => callbacksRef.current.onMouseMove?.(storagePoint(event.lnglat)));
      map.on('mouseout', () => callbacksRef.current.onMouseMove?.(null));

      // AMap stops emitting its map-level dblclick event when double-click zoom is
      // disabled. Listen on the native map surface so drawing can still finish
      // without re-enabling a zoom gesture that would move the final vertex.
      surfaceDoubleClickHandler = (event) => {
        if (event.target?.closest?.('.map-engine-handle, .amap-native-info-window')) return;
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (!rect) return;
        const position = map.containerToLngLat(new AMap.Pixel(event.clientX - rect.left, event.clientY - rect.top));
        callbacksRef.current.onMapDoubleClick?.(storagePoint(position), event);
      };
      surfaceRef.current.addEventListener('dblclick', surfaceDoubleClickHandler, true);

      const surface = surfaceRef.current;
      const isInteractive = (event) => Boolean(event.target?.closest?.('.amap-native-info-window, .map-engine-handle, .custom-map-pin-wrap'));
      const contextAt = (clientX, clientY) => {
        const rect = surface.getBoundingClientRect();
        const native = map.containerToLngLat(new AMap.Pixel(clientX - rect.left, clientY - rect.top));
        callbacksRef.current.onContextMenu?.(storagePoint(native), { x: clientX, y: clientY });
      };
      const handleContext = (event) => {
        if (!callbacksRef.current.onContextMenu || isInteractive(event)) return;
        event.preventDefault();
        contextAt(event.clientX, event.clientY);
        suppressClickUntil = Date.now() + 200;
      };
      const cancelPress = () => { window.clearTimeout(pressTimer); pressOrigin = null; };
      const pointerDown = (event) => {
        viewSource = 'user';
        cancelPress();
        pressHandled = false;
        if (event.pointerType === 'touch') touchPointers.add(event.pointerId);
        if (touchPointers.size > 1) return;
        if (event.pointerType !== 'touch' || !callbacksRef.current.onContextMenu || isInteractive(event)) return;
        pressOrigin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        pressTimer = window.setTimeout(() => {
          if (!pressOrigin) return;
          contextAt(pressOrigin.x, pressOrigin.y);
          suppressClickUntil = Date.now() + 900;
          pressHandled = true;
          pressOrigin = null;
        }, 550);
      };
      const pointerMove = (event) => {
        if (pressOrigin && (event.pointerId !== pressOrigin.pointerId || Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 10)) cancelPress();
      };
      const markUserMove = () => { viewSource = 'user'; cancelPress(); };
      const finishPress = (event) => {
        touchPointers.delete(event.pointerId);
        if (pressHandled) suppressClickUntil = Date.now() + 350;
        pressHandled = false;
        cancelPress();
      };
      surface.addEventListener('contextmenu', handleContext, true);
      surface.addEventListener('pointerdown', pointerDown, true);
      surface.addEventListener('pointermove', pointerMove, true);
      surface.addEventListener('pointerup', finishPress, true);
      surface.addEventListener('pointercancel', finishPress, true);
      surface.addEventListener('wheel', markUserMove, { passive: true });
      const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const updateMotion = (event) => map.setStatus({ animateEnable: !event.matches });
      motionQuery?.addEventListener?.('change', updateMotion);
      removeSurfaceListeners = () => {
        cancelPress();
        surface.removeEventListener('contextmenu', handleContext, true);
        surface.removeEventListener('pointerdown', pointerDown, true);
        surface.removeEventListener('pointermove', pointerMove, true);
        touchPointers.clear();
        surface.removeEventListener('pointerup', finishPress, true);
        surface.removeEventListener('pointercancel', finishPress, true);
        surface.removeEventListener('wheel', markUserMove);
        motionQuery?.removeEventListener?.('change', updateMotion);
      };

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
      if (viewFrame) window.cancelAnimationFrame(viewFrame);
      removeSurfaceListeners();
      resizeObserver?.disconnect();
      if (surfaceDoubleClickHandler) surfaceRef.current?.removeEventListener('dblclick', surfaceDoubleClickHandler, true);
      infoWindowRef.current?.close();
      editorRef.current?.close();
      editorRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      trafficLayerRef.current = null;
      trafficAttachedRef.current = false;
      baseLayersRef.current = null;
      appliedBaseMapKeyRef.current = null;
      controllerRef.current = null;
      amapRef.current = null;
      overlayRegistryRef.current.clear();
      featureLookupRef.current.clear();
      draftOverlaysRef.current = [];
      candidateOverlaysRef.current = [];
      measurementOverlaysRef.current = [];
      routeOverlaysRef.current = [];
      candidateLookupRef.current.clear();
      tooltipRef.current = null;
      tooltipElementRef.current = null;
      infoWindowRef.current = null;
      popupOpenRef.current = false;
      programmaticPopupRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return;
    if (trafficVisible && !trafficAttachedRef.current) {
      trafficLayerRef.current ||= new amapRef.current.TileLayer.Traffic({ zIndex: 12 });
      mapRef.current.add(trafficLayerRef.current);
      trafficAttachedRef.current = true;
    } else if (!trafficVisible && trafficAttachedRef.current) {
      mapRef.current.remove(trafficLayerRef.current);
      trafficAttachedRef.current = false;
    }
  }, [ready, trafficVisible]);

  const baseMapKey = normalizeBaseMapKey(mapData.base_map);
  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return;
    if (appliedBaseMapKeyRef.current === baseMapKey) return;

    const config = getBaseMapConfig(baseMapKey);
    mapRef.current.setMapStyle(config.mapStyle);
    // Preserve Map's native vector resources while replacing only the active
    // raster/satellite base layers; do not reset all map layers with setLayers.
    showBaseLayerSet(mapRef.current, baseLayersRef.current, baseMapKey);
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
    // Directions are edited by requesting a new official route through a stop.
    // A generic PolylineEditor would silently turn that route into a free line.
    if (featureLookupRef.current.get(selectedFeatureId)?.feature.style?.routeData) return undefined;
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

  const measurementSignature = JSON.stringify(measurementPoints);
  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return undefined;
    const map = mapRef.current;
    const AMap = amapRef.current;
    const overlays = [];
    const points = measurementPoints.map(validPosition).filter(Boolean);
    const closed = measurementClosed && points.length >= 3;
    const path = points.map(displayPosition);
    if (path.length >= 2) {
      overlays.push(new AMap.Polyline({ path: closed ? [...path, path[0]] : path, strokeColor: '#3c4043', strokeWeight: 3, strokeOpacity: .9, zIndex: 560, bubble: true }));
      if (closed) overlays.push(new AMap.Polygon({ path, strokeOpacity: 0, fillColor: '#1a73e8', fillOpacity: .08, zIndex: 550, bubble: true }));
    }
    points.forEach((position, index) => {
      const label = text(`测量点 ${index + 1}，拖动调整，点击删除`, `Measurement point ${index + 1}; drag to move, click to remove`);
      const content = handleElement('#3c4043', label, 'measurement', index);
      const marker = new AMap.Marker({ position: displayPosition(position), anchor: 'center', content, draggable: true, zIndex: 580, bubble: false, title: label });
      let suppressUntil = 0;
      const removePoint = () => {
        if (Date.now() < suppressUntil) return;
        const next = measurementPointsRef.current.filter((_, pointIndex) => pointIndex !== index);
        callbacksRef.current.onMeasurementChange?.(next, { index, action: 'remove' });
      };
      marker.on('dragstart', () => { suppressUntil = Infinity; });
      marker.on('dragend', () => {
        suppressUntil = Date.now() + 350;
        const point = storagePoint(marker.getPosition());
        const next = measurementPointsRef.current.map((item, pointIndex) => pointIndex === index ? [point.lng, point.lat] : item);
        callbacksRef.current.onMeasurementChange?.(next, { index, action: 'move' });
      });
      marker.on('click', removePoint);
      content.addEventListener('keydown', (event) => {
        if (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); removePoint(); }
      });
      overlays.push(marker);
    });
    if (overlays.length) map.add(overlays);
    measurementOverlaysRef.current = overlays;
    return () => {
      if (mapRef.current && overlays.length) mapRef.current.remove(overlays);
      if (measurementOverlaysRef.current === overlays) measurementOverlaysRef.current = [];
    };
  }, [measurementSignature, measurementClosed, ready, lang]);

  const savedRoute = mapData.layers.flatMap((layer) => layer.features.map((feature) => ({ feature, layer })))
    .find(({ feature }) => feature.id === selectedFeatureId && feature.style?.routeData);
  const routeSignature = JSON.stringify([routeAlternatives, routePlan, savedRoute?.feature.geometry, savedRoute?.feature.style?.routeData, savedRoute?.feature.id]);
  useEffect(() => {
    if (!ready || !mapRef.current || !amapRef.current) return undefined;
    const map = mapRef.current;
    const AMap = amapRef.current;
    const overlays = [];
    const selectedGeometry = routePlan?.geometry;
    const createRouteLine = (alternative, selected, clickable = true) => {
      const path = geometryCoordinates(alternative.geometry).map(displayPosition);
      if (path.length < 2) return;
      const overlay = new AMap.Polyline({ path, strokeColor: selected ? '#1a73e8' : '#a5abb4', strokeWeight: selected ? 7 : 6, strokeOpacity: selected ? .96 : .8, zIndex: selected ? 410 : 390, lineJoin: 'round', lineCap: 'round', cursor: 'pointer', bubble: false });
      if (clickable) overlay.on('click', (event) => {
        event?.originEvent?.stopPropagation?.();
        callbacksRef.current.onRouteSelect?.(alternative.id);
      });
      overlays.push(overlay);
    };
    routeAlternatives.forEach((alternative) => createRouteLine(alternative, Boolean(alternative.selected)));
    if (selectedGeometry && !routeAlternatives.some((alternative) => alternative.selected)) createRouteLine(routePlan, true, false);
    const addHandles = (plan, savedContext) => {
      const callback = savedContext ? callbacksRef.current.onSavedRouteWaypoint : callbacksRef.current.onRouteWaypoint;
      if (!callback) return;
      routeHandlePositions(plan).forEach((handle, index) => {
        const isStop = handle.stopIndex !== undefined;
        const label = isStop
          ? text(`路线站点 ${handle.stopIndex + 1}，拖动重新规划`, `Route stop ${handle.stopIndex + 1}; drag to replan`)
          : text(`路线第 ${handle.segmentIndex + 1} 段，拖动添加途经点`, `Route segment ${handle.segmentIndex + 1}; drag to add a waypoint`);
        const content = handleElement('#1a73e8', label, isStop ? 'route-stop' : 'route-waypoint', index);
        if (isStop) { content.textContent = String(handle.stopIndex + 1); content.style.width = '24px'; content.style.height = '24px'; content.style.fontSize = '11px'; }
        const marker = new AMap.Marker({ position: displayPosition(handle.position), anchor: 'center', content, draggable: true, zIndex: isStop ? 470 : 460, bubble: false, title: label });
        marker.on('dragend', () => {
          const point = storagePoint(marker.getPosition());
          const payload = { position: [point.lng, point.lat], segmentIndex: handle.segmentIndex, ...(isStop ? { stopIndex: handle.stopIndex } : {}) };
          // Do not alter any service geometry while the request is pending or
          // failed. The parent replaces the path only with a successful route.
          marker.setPosition(displayPosition(handle.position));
          if (savedContext) {
            const latest = featureLookupRef.current.get(savedContext.feature.id);
            if (latest) callbacksRef.current.onSavedRouteWaypoint?.(latest.feature, payload, latest.layer);
          } else callbacksRef.current.onRouteWaypoint?.(payload);
        });
        overlays.push(marker);
      });
    };
    // Planning a preview changes only temporary directions state. Read-only
    // map visitors may drag it; editing saved route features still needs access.
    if (routePlan?.geometry) addHandles(routePlan);
    if (!routePlan?.geometry && editable && activeTool === 'pan' && savedRoute) addHandles({ geometry: savedRoute.feature.geometry, ...savedRoute.feature.style.routeData }, savedRoute);
    if (overlays.length) map.add(overlays);
    routeOverlaysRef.current = overlays;
    return () => {
      if (mapRef.current && overlays.length) mapRef.current.remove(overlays);
      if (routeOverlaysRef.current === overlays) routeOverlaysRef.current = [];
    };
  }, [routeSignature, ready, editable, activeTool, lang]);

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
      overlays.push(new AMap.Marker({ position: displayPosition(hoverPoint), anchor: 'bottom-center', content: pinElement(markerColor, false, false, markerIcon), opacity: 0.62, zIndex: 530, bubble: true, cursor: 'crosshair' }));
    }
    if (draftMarker) {
      overlays.push(new AMap.Marker({ position: displayPosition(draftMarker.position), anchor: 'bottom-center', content: pinElement(draftMarker.color || DEFAULT_COLOR, true, false, draftMarker.icon || markerIcon), zIndex: 540, bubble: true }));
    }
    if (overlays.length) map.add(overlays);
    draftOverlaysRef.current = overlays;
    shellRef.current.dataset.drawTool = activeTool === 'pan' ? '' : activeTool;
    const drawing = activeTool && activeTool !== 'pan';
    map.setDefaultCursor(drawing ? 'crosshair' : 'grab');
    map.setStatus({ dragEnable: true, doubleClickZoom: !drawing });

    return () => {
      if (mapRef.current && overlays.length) mapRef.current.remove(overlays);
      if (draftOverlaysRef.current === overlays) draftOverlaysRef.current = [];
    };
  }, [activeTool, draftMarker, draftPoints, hoverPoint, markerColor, markerIcon, ready]);

  const popupLng = popup?.position?.[0];
  const popupLat = popup?.position?.[1];
  useEffect(() => {
    if (!ready || !mapRef.current || !infoWindowRef.current) return;
    programmaticPopupRef.current = true;
    try {
      if (!Number.isFinite(popupLng) || !Number.isFinite(popupLat)) {
        popupOpenRef.current = false;
        infoWindowRef.current.close();
      } else {
        infoWindowRef.current.open(mapRef.current, toDisplayLngLat(popupLng, popupLat));
        popupOpenRef.current = true;
      }
    } finally {
      programmaticPopupRef.current = false;
    }
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
