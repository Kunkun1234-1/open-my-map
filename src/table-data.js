import Papa from 'papaparse';

const CUSTOM_FIELD_PREFIX = 'data:';
const CUSTOM_COLUMN_ID = /^col_[A-Za-z0-9_-]+$/;

export function tableCustomFieldId(field) {
  if (typeof field !== 'string' || !field.startsWith(CUSTOM_FIELD_PREFIX)) return null;
  const id = field.slice(CUSTOM_FIELD_PREFIX.length);
  return CUSTOM_COLUMN_ID.test(id) ? id : null;
}

export function tableFieldValue(feature, field) {
  if (field === 'name' || field === 'description') return String(feature?.[field] ?? '');
  const columnId = tableCustomFieldId(field);
  if (!columnId) return '';
  return String(feature?.properties?.[columnId] ?? '');
}

function customColumns(layer) {
  return Array.isArray(layer?.columns)
    ? layer.columns.filter((column) => tableCustomFieldId(`data:${column?.id}`))
    : [];
}

export function layerCsv(layer) {
  const columns = customColumns(layer);
  const fields = [
    'name',
    'description',
    ...columns.map((column) => String(column.name ?? '')),
    'type',
    'longitude',
    'latitude',
    'geometry',
  ];
  const data = (layer?.features || []).map((feature) => {
    const coordinates = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
    return [
      tableFieldValue(feature, 'name'),
      tableFieldValue(feature, 'description'),
      ...columns.map((column) => tableFieldValue(feature, `data:${column.id}`)),
      String(feature?.type ?? feature?.geometry?.type ?? ''),
      coordinates?.[0] ?? '',
      coordinates?.[1] ?? '',
      JSON.stringify(feature?.geometry ?? null),
    ];
  });
  return Papa.unparse({ fields, data });
}

export function layerCustomGeoJsonProperties(layer, feature, reserved = {}) {
  const properties = { ...reserved };
  for (const column of customColumns(layer)) {
    const name = String(column.name ?? '');
    if (!name || Object.hasOwn(properties, name)) continue;
    properties[name] = tableFieldValue(feature, `data:${column.id}`);
  }
  return properties;
}
