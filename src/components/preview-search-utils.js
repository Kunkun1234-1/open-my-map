export const PREVIEW_SEARCH_RESULT_LIMIT = 50;

export function normalizePreviewSearch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function previewRecordKind(feature) {
  if (feature?.type === 'Point') return 'point';
  if (feature?.type === 'Polygon') return 'area';
  if (feature?.type === 'LineString') return 'line';
  return 'record';
}

export function previewRecordSearchText(record) {
  const feature = record?.feature;
  const layer = record?.layer;
  if (!feature) return '';
  return normalizePreviewSearch([
    feature.name,
    feature.description,
    layer?.name,
    feature.type,
    previewRecordKind(feature),
  ].filter(Boolean).join(' '));
}

export function filterPreviewRecords(records, query, limit = PREVIEW_SEARCH_RESULT_LIMIT) {
  const source = Array.isArray(records) ? records : [];
  const maximum = Number.isFinite(Number(limit))
    ? Math.max(0, Math.floor(Number(limit)))
    : PREVIEW_SEARCH_RESULT_LIMIT;
  if (maximum === 0) return [];
  const tokens = normalizePreviewSearch(query).split(' ').filter(Boolean);
  const result = [];
  for (const record of source) {
    if (!record?.feature) continue;
    const searchable = previewRecordSearchText(record);
    if (tokens.every((token) => searchable.includes(token))) {
      result.push(record);
      if (result.length >= maximum) break;
    }
  }
  return result;
}
