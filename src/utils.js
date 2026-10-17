import Papa from 'papaparse';
import { kml, gpx } from '@tmcw/togeojson';
import { AMAP_CONFIGURED } from './amap.js';
import { layerCsv, layerCustomGeoJsonProperties } from './table-data.js';

export const AMAP_PROVIDER = '高德地图';

export const BASE_MAPS = {
  standard: {
    name: '高德·标准',
    englishName: 'AMap Standard',
    provider: AMAP_PROVIDER,
    description: '高德官方标准矢量底图',
    mapStyle: 'amap://styles/normal',
    layerType: 'default',
  },
  satellite: {
    name: '高德·卫星',
    englishName: 'AMap Satellite',
    provider: AMAP_PROVIDER,
    description: '高德官方卫星影像与路网注记',
    mapStyle: 'amap://styles/normal',
    layerType: 'satellite',
  },
  terrain: {
    name: '高德·浅色',
    englishName: 'AMap Light',
    provider: AMAP_PROVIDER,
    description: '高德官方月光银浅色矢量底图',
    mapStyle: 'amap://styles/light',
    layerType: 'default',
  },
};

const BASE_MAP_PREVIEWS = {
  standard: {
    backgroundColor: '#dfead9',
    backgroundImage: 'linear-gradient(26deg, transparent 43%, rgba(255,255,255,.95) 44% 49%, #b7c9ad 50% 51%, transparent 52%), linear-gradient(112deg, transparent 41%, #f7d7a0 42% 47%, transparent 48%), linear-gradient(165deg, transparent 35%, #b8d5ea 36% 43%, transparent 44%)',
  },
  satellite: {
    backgroundColor: '#233b32',
    backgroundImage: 'linear-gradient(24deg, transparent 44%, rgba(226,218,178,.88) 45% 48%, transparent 49%), radial-gradient(circle at 24% 28%, #3d6650 0 15%, transparent 16%), radial-gradient(circle at 70% 66%, #506744 0 21%, transparent 22%), linear-gradient(145deg, #152b35, #49613f)',
  },
  terrain: {
    backgroundColor: '#edf0ed',
    backgroundImage: 'linear-gradient(32deg, transparent 40%, #fff 41% 48%, #cbd3d1 49% 50%, transparent 51%), linear-gradient(145deg, transparent 36%, #d3e4ea 37% 44%, transparent 45%), radial-gradient(ellipse at 75% 30%, #dfe8dc 0 22%, transparent 23%)',
  },
};

export function normalizeBaseMapKey(baseMapKey) {
  return Object.hasOwn(BASE_MAPS, baseMapKey) ? baseMapKey : 'standard';
}

export function getBaseMapConfig(baseMapKey) {
  return BASE_MAPS[normalizeBaseMapKey(baseMapKey)];
}

export function baseMapPreviewStyle(baseMapKey) {
  if (!AMAP_CONFIGURED) return { backgroundImage: 'none' };
  return BASE_MAP_PREVIEWS[normalizeBaseMapKey(baseMapKey)];
}

const colorCycle = ['#1a73e8', '#00897b', '#8e24aa', '#e85d4a', '#f9ab00', '#5f6368'];

function normalizeFeature(feature, index) {
  const geometry = feature.geometry;
  if (!geometry || !['Point', 'LineString', 'Polygon'].includes(geometry.type)) return null;
  const properties = feature.properties || {};
  return {
    name: String(properties.name || properties.Name || properties.title || properties.Title || `导入要素 ${index + 1}`),
    description: String(properties.description || properties.Description || ''),
    geometry,
    style: {
      color: properties.color || colorCycle[index % colorCycle.length],
      fillColor: properties.fillColor || properties.color || colorCycle[index % colorCycle.length],
      fillOpacity: Number(properties.fillOpacity ?? 0.25),
      weight: Number(properties.weight ?? 4),
    },
  };
}

export async function parseImportFile(file) {
  const text = await file.text();
  const extension = file.name.split('.').pop()?.toLowerCase();
  let geojson;
  if (extension === 'csv' || extension === 'tsv') {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: extension === 'tsv' ? '\t' : '' });
    const rows = parsed.data || [];
    const features = rows.map((row, index) => {
      const lat = Number(row.latitude ?? row.lat ?? row.纬度);
      const lng = Number(row.longitude ?? row.lng ?? row.lon ?? row.经度);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          ...row,
          name: row.name || row.title || row.名称 || `导入地点 ${index + 1}`,
          description: row.description || row.说明 || row.地址 || '',
        },
      };
    }).filter(Boolean);
    geojson = { type: 'FeatureCollection', features };
  } else if (extension === 'kml' || extension === 'gpx') {
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    geojson = extension === 'kml' ? kml(xml) : gpx(xml);
  } else {
    geojson = JSON.parse(text);
  }
  const rawFeatures = geojson.type === 'FeatureCollection' ? geojson.features : geojson.type === 'Feature' ? [geojson] : [];
  return rawFeatures.map(normalizeFeature).filter(Boolean);
}

export function mapToGeoJson(map) {
  return {
    type: 'FeatureCollection',
    name: map.name,
    features: map.layers.flatMap((layer) => layer.features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: layerCustomGeoJsonProperties(layer, feature, {
        id: feature.id,
        name: feature.name,
        description: feature.description,
        layer: layer.name,
        ...feature.style,
      }),
    }))),
  };
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportGeoJson(map) {
  downloadFile(`${map.name}.geojson`, JSON.stringify(mapToGeoJson(map), null, 2), 'application/geo+json');
}

export function exportCsv(layer) {
  downloadFile(`${layer.name}.csv`, `\uFEFF${layerCsv(layer)}`, 'text/csv;charset=utf-8');
}

export function exportKml(map) {
  const placemarks = map.layers.flatMap((layer) => layer.features.map((feature) => {
    const escapedName = feature.name.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
    let geometry;
    if (feature.type === 'Point') {
      geometry = `<Point><coordinates>${feature.geometry.coordinates.join(',')}</coordinates></Point>`;
    } else if (feature.type === 'LineString') {
      geometry = `<LineString><coordinates>${feature.geometry.coordinates.map((point) => point.join(',')).join(' ')}</coordinates></LineString>`;
    } else {
      geometry = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${feature.geometry.coordinates[0].map((point) => point.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    }
    return `<Placemark><name>${escapedName}</name><description>${feature.description || ''}</description>${geometry}</Placemark>`;
  })).join('');
  const kmlText = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${map.name}</name>${placemarks}</Document></kml>`;
  downloadFile(`${map.name}.kml`, kmlText, 'application/vnd.google-earth.kml+xml');
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function distanceMeters(points) {
  const radius = 6371000;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [lng1, lat1] = points[i - 1];
    const [lng2, lat2] = points[i];
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    total += radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}
