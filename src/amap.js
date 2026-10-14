export const AMAP_KEY = String(import.meta.env?.VITE_AMAP_KEY || '').trim();
export const AMAP_SECURITY_JS_CODE = String(import.meta.env?.VITE_AMAP_SECURITY_JS_CODE || '').trim();
export const AMAP_CONFIGURED = Boolean(AMAP_KEY);

let loaderPromise;

export function loadAMap() {
  if (!AMAP_CONFIGURED) {
    return Promise.reject(new Error('缺少 VITE_AMAP_KEY'));
  }

  if (!loaderPromise) {
    if (AMAP_SECURITY_JS_CODE) {
      window._AMapSecurityConfig = {
        ...(window._AMapSecurityConfig || {}),
        securityJsCode: AMAP_SECURITY_JS_CODE,
      };
    }

    loaderPromise = import('@amap/amap-jsapi-loader').then(({ default: AMapLoader }) => AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: [],
    }));
  }

  return loaderPromise;
}

const GCJ_PI = Math.PI;
const GCJ_A = 6378245;
const GCJ_EE = 0.006693421622965943;

function outsideChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLatitude(lng, lat) {
  let result = -100 + (2 * lng) + (3 * lat) + (0.2 * lat * lat) + (0.1 * lng * lat)
    + (0.2 * Math.sqrt(Math.abs(lng)));
  result += ((20 * Math.sin(6 * lng * GCJ_PI)) + (20 * Math.sin(2 * lng * GCJ_PI))) * 2 / 3;
  result += ((20 * Math.sin(lat * GCJ_PI)) + (40 * Math.sin(lat / 3 * GCJ_PI))) * 2 / 3;
  result += ((160 * Math.sin(lat / 12 * GCJ_PI)) + (320 * Math.sin(lat * GCJ_PI / 30))) * 2 / 3;
  return result;
}

function transformLongitude(lng, lat) {
  let result = 300 + lng + (2 * lat) + (0.1 * lng * lng) + (0.1 * lng * lat)
    + (0.1 * Math.sqrt(Math.abs(lng)));
  result += ((20 * Math.sin(6 * lng * GCJ_PI)) + (20 * Math.sin(2 * lng * GCJ_PI))) * 2 / 3;
  result += ((20 * Math.sin(lng * GCJ_PI)) + (40 * Math.sin(lng / 3 * GCJ_PI))) * 2 / 3;
  result += ((150 * Math.sin(lng / 12 * GCJ_PI)) + (300 * Math.sin(lng / 30 * GCJ_PI))) * 2 / 3;
  return result;
}

export function wgs84ToGcj02(lngValue, latValue) {
  const lng = Number(lngValue);
  const lat = Number(latValue);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || outsideChina(lng, lat)) return [lng, lat];

  let latitudeDelta = transformLatitude(lng - 105, lat - 35);
  let longitudeDelta = transformLongitude(lng - 105, lat - 35);
  const latitudeRadians = lat / 180 * GCJ_PI;
  const magicSin = Math.sin(latitudeRadians);
  const magic = 1 - (GCJ_EE * magicSin * magicSin);
  const magicRoot = Math.sqrt(magic);
  latitudeDelta = (latitudeDelta * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * magicRoot) * GCJ_PI);
  longitudeDelta = (longitudeDelta * 180) / (GCJ_A / magicRoot * Math.cos(latitudeRadians) * GCJ_PI);
  return [lng + longitudeDelta, lat + latitudeDelta];
}

export function gcj02ToWgs84(lngValue, latValue) {
  const lng = Number(lngValue);
  const lat = Number(latValue);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || outsideChina(lng, lat)) return [lng, lat];

  let wgsLng = lng;
  let wgsLat = lat;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const [convertedLng, convertedLat] = wgs84ToGcj02(wgsLng, wgsLat);
    wgsLng -= convertedLng - lng;
    wgsLat -= convertedLat - lat;
  }
  return [wgsLng, wgsLat];
}

export function toDisplayLatLng(lngValue, latValue) {
  const [lng, lat] = wgs84ToGcj02(lngValue, latValue);
  return [lat, lng];
}

export function toDisplayLngLat(lngValue, latValue) {
  return wgs84ToGcj02(lngValue, latValue);
}

export function toStorageLngLat(lngValue, latValue) {
  return gcj02ToWgs84(lngValue, latValue);
}

const servicePromises = new Map();

async function mapService(pluginName) {
  const AMap = await loadAMap();
  if (!servicePromises.has(pluginName)) {
    servicePromises.set(pluginName, new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        servicePromises.delete(pluginName);
        reject(new Error('地图服务加载超时，请检查网络与高德 Key 配置。'));
      }, 12_000);
      AMap.plugin(`AMap.${pluginName}`, () => {
        window.clearTimeout(timeout);
        if (!AMap[pluginName]) {
          servicePromises.delete(pluginName);
          reject(new Error('地图服务暂不可用。'));
          return;
        }
        resolve(AMap);
      });
    }));
  }
  return servicePromises.get(pluginName);
}

function storagePosition(position) {
  if (!position) return null;
  const lng = Number(position.getLng?.() ?? position.lng);
  const lat = Number(position.getLat?.() ?? position.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? toStorageLngLat(lng, lat) : null;
}

function poiResult(poi, index) {
  return {
    id: `amap-${poi.id || `${poi.name}-${index}`}`,
    name: poi.name || '',
    address: [poi.pname, poi.cityname, poi.adname, typeof poi.address === 'string' ? poi.address : ''].filter(Boolean).join(' '),
    position: storagePosition(poi.location),
    type: poi.type || '',
    city: poi.adcode || poi.cityname || '',
    index: index + 1,
  };
}

function searchService(service, query, resultKey) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('地图搜索超时，请稍后重试。')), 12_000);
    service.search(query, (status, result) => {
      window.clearTimeout(timeout);
      if (status === 'no_data') { resolve([]); return; }
      if (status !== 'complete') { reject(new Error(result?.info || '地图搜索暂不可用，请检查服务权限。')); return; }
      const rows = resultKey === 'tips' ? result.tips : result.poiList?.pois;
      resolve((rows || []).map(poiResult));
    });
  });
}

export async function suggestAMapPlaces(query) {
  if (!query.trim()) return [];
  const AMap = await mapService('AutoComplete');
  return searchService(new AMap.AutoComplete({ datatype: 'all' }), query, 'tips');
}

export async function searchAMapPlaces(query) {
  const AMap = await mapService('PlaceSearch');
  const rows = await searchService(new AMap.PlaceSearch({ pageSize: 10, extensions: 'base' }), query, 'pois');
  return rows.filter((row) => row.position).map((row, index) => ({ ...row, index: index + 1 }));
}

export async function routeAMap(points, travelMode = 'driving') {
  const pluginName = travelMode === 'walking' ? 'Walking' : travelMode === 'cycling' ? 'Riding' : 'Driving';
  const AMap = await mapService(pluginName);
  const positions = points.map(([lng, lat]) => toDisplayLngLat(lng, lat));
  const service = new AMap[pluginName]({ hideMarkers: true });
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('路线规划超时，请稍后重试。')), 15_000);
    service.search(positions[0], positions[1], (status, result) => {
      window.clearTimeout(timeout);
      const route = (result?.routes || result?.rides)?.[0];
      const coordinates = (route?.steps || []).flatMap((step) => (step.path || []).map(storagePosition)).filter(Boolean);
      if (status !== 'complete' || coordinates.length < 2) {
        reject(new Error(result?.info || '暂未找到可用路线，请调整起点或终点。'));
        return;
      }
      resolve({ geometry: { type: 'LineString', coordinates }, distance: route.distance, duration: route.time });
    });
  });
}
