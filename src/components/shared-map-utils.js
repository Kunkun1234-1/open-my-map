export function sharedMapLayers(layers, query, visibility) {
  const needle = query.trim().toLocaleLowerCase();
  return layers.map((layer) => ({
    ...layer,
    visible: Boolean(Object.hasOwn(visibility, layer.id) ? visibility[layer.id] : layer.visible),
    features: layer.features.filter((feature) => !needle || [feature.name, feature.description, layer.name]
      .some((value) => String(value || '').toLocaleLowerCase().includes(needle))),
  }));
}

// Old maps keep their layer order. New records append naturally, while deleted
// or hidden records cannot leave holes or duplicate items in the visible story.
export function orderStoryRecords(records, featureIds = []) {
  const remaining = new Map(records.map((record) => [record.feature.id, record]));
  const result = [];
  for (const id of Array.isArray(featureIds) ? featureIds : []) {
    if (!remaining.has(id)) continue;
    result.push(remaining.get(id));
    remaining.delete(id);
  }
  return [...result, ...remaining.values()];
}

export function moveStoryRecord(featureIds, sourceId, targetId) {
  const source = featureIds.indexOf(sourceId);
  const target = featureIds.indexOf(targetId);
  if (source < 0 || target < 0 || source === target) return featureIds;
  const result = [...featureIds];
  result.splice(source, 1);
  result.splice(target, 0, sourceId);
  return result;
}

// Presentation changes are transient; keep the saved geometry, route metadata
// and source styles intact when enhancing overlays for a shared map.
export function sharedPresentationLayers(layers) {
  return layers.map((layer) => ({
    ...layer,
    features: layer.features.map((feature) => {
      if (feature.type === 'Point') return feature;
      const color = feature.style?.color || layer.style?.color || '#2563EB';
      const palette = { '#1a73e8': '#2563EB', '#e85d4a': '#EF4444', '#d93025': '#EF4444' };
      return {
        ...feature,
        style: {
          ...feature.style,
          color: palette[color.toLowerCase()] || color,
          ...(feature.type === 'LineString'
            ? { weight: 5, isOutline: true, outlineColor: '#FFFFFF', borderWeight: 2 }
            : { weight: 3, fillOpacity: Math.min(feature.style?.fillOpacity ?? layer.style?.fillOpacity ?? 0.16, 0.16) }),
        },
      };
    }),
  }));
}
