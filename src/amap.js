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
  const source = typeof position === 'string' ? position.split(',') : position;
  const lng = Number(Array.isArray(source) ? source[0] : source.getLng?.() ?? source.lng);
  const lat = Number(Array.isArray(source) ? source[1] : source.getLat?.() ?? source.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? toStorageLngLat(lng, lat) : null;
}

function serviceText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function webLink(value) {
  const url = serviceText(value);
  if (!url) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}

function poiResult(poi, index = 0) {
  const poiId = serviceText(poi.id);
  const category = serviceText(poi.type);
  const photos = (Array.isArray(poi.photos) ? poi.photos : []).map((photo) => ({
    url: webLink(photo.url), title: serviceText(photo.title),
  })).filter((photo) => photo.url);
  return {
    id: `amap-${poiId || `${poi.name}-${index}`}`,
    poiId: poiId || null,
    name: serviceText(poi.name),
    address: [poi.pname, poi.cityname, poi.adname, poi.address].map(serviceText).filter(Boolean).join(' '),
    position: storagePosition(poi.location),
    type: category,
    category,
    city: serviceText(poi.adcode || poi.cityname),
    phone: serviceText(poi.tel || poi.business?.tel),
    website: webLink(poi.website || poi.business?.website),
    businessHours: serviceText(poi.business?.opentime_week || poi.business?.opentime_today || poi.businessHours || poi.businesshours),
    photos,
    coordinateSystem: 'WGS84',
    source: 'AMap',
    index: index + 1,
  };
}

function serviceRequest(request, fallbackMessage = '地图搜索暂不可用，请检查服务权限。') {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('地图搜索超时，请稍后重试。')), 12_000);
    try {
      request((status, result) => {
        window.clearTimeout(timeout);
        if (status === 'no_data') { resolve(null); return; }
        if (status !== 'complete') { reject(new Error(result?.info || fallbackMessage)); return; }
        resolve(result);
      });
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}

export async function suggestAMapPlaces(query) {
  if (!String(query).trim()) return [];
  const AMap = await mapService('AutoComplete');
  const service = new AMap.AutoComplete({ datatype: 'all' });
  const result = await serviceRequest((callback) => service.search(query, callback));
  return (result?.tips || []).map(poiResult);
}

function searchBounds(AMap, bounds) {
  const southWest = bounds?.southWest || bounds?.southwest || bounds?.[0]
    || (bounds?.west !== undefined ? [bounds.west, bounds.south] : null);
  const northEast = bounds?.northEast || bounds?.northeast || bounds?.[1]
    || (bounds?.east !== undefined ? [bounds.east, bounds.north] : null);
  if (!Array.isArray(southWest) || !Array.isArray(northEast)
    || [...southWest, ...northEast].length !== 4
    || ![...southWest, ...northEast].every((value) => Number.isFinite(Number(value)))) {
    throw new Error('当前地图范围不可用，请稍后再试。');
  }
  return new AMap.Bounds(toDisplayLngLat(...southWest), toDisplayLngLat(...northEast));
}

export async function searchAMapPlaces(query, options) {
  const structured = options !== undefined;
  const settings = options || {};
  const page = Math.min(100, Math.max(1, Math.floor(Number(settings.page) || 1)));
  const pageSize = 10;
  if (!String(query).trim()) return structured ? { places: [], total: 0, page, pageSize } : [];
  const AMap = await mapService('PlaceSearch');
  const service = new AMap.PlaceSearch({
    pageSize, pageIndex: page, extensions: 'all', ...(settings.city ? { city: settings.city } : {}),
  });
  const result = await serviceRequest((callback) => {
    if (settings.bounds) service.searchInBounds(query, searchBounds(AMap, settings.bounds), callback);
    else service.search(query, callback);
  });
  const places = (result?.poiList?.pois || []).map(poiResult).filter((row) => row.position)
    .map((row, index) => ({ ...row, index: ((page - 1) * pageSize) + index + 1 }));
  const total = Number.isFinite(Number(result?.poiList?.count)) ? Number(result.poiList.count) : places.length;
  return structured ? { places, total, page, pageSize } : places;
}

export async function getAMapPlace(id) {
  const poiId = String(id || '').replace(/^amap-/, '').trim();
  if (!poiId) throw new Error('缺少地点标识。');
  const AMap = await mapService('PlaceSearch');
  const service = new AMap.PlaceSearch({ extensions: 'all' });
  const result = await serviceRequest((callback) => service.getDetails(poiId, callback), '地点详情暂不可用。');
  const poi = result?.poiList?.pois?.[0];
  if (!poi) throw new Error('暂未找到此地点的详细资料。');
  return poiResult(poi);
}

export async function reverseGeocodeAMap(position) {
  if (!Array.isArray(position) || position.length !== 2 || !position.every((value) => Number.isFinite(Number(value)))) {
    throw new Error('地点坐标无效。');
  }
  const AMap = await mapService('Geocoder');
  const service = new AMap.Geocoder({ extensions: 'all' });
  const result = await serviceRequest((callback) => service.getAddress(toDisplayLngLat(...position), callback), '地址解析暂不可用。');
  const address = result?.regeocode;
  if (!address) throw new Error('暂未找到此位置的地址。');
  const nearest = (address.pois || [])[0];
  return {
    id: `coordinate-${position.join('-')}`,
    poiId: null,
    name: serviceText(address.addressComponent?.building?.name) || '选定的位置',
    address: serviceText(address.formattedAddress),
    position: position.map(Number),
    type: '', category: '', phone: '', website: '', businessHours: '', photos: [],
    nearbyPlace: nearest ? poiResult(nearest) : null,
    coordinateSystem: 'WGS84', source: 'AMap', index: 1,
  };
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
