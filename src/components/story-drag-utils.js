function validRows(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) =>
    item?.id != null &&
    Number.isFinite(item.top) &&
    Number.isFinite(item.height) &&
    item.height >= 0,
  );
}

function storyRowGap(rows) {
  if (rows.length < 2) return 0;
  return Math.max(0, rows[1].top - rows[0].top - rows[0].height);
}

export function getStoryDragTarget(items, centerY, scrollDelta = 0) {
  if (!Number.isFinite(centerY)) return null;
  const rows = validRows(items);
  if (!rows.length) return null;
  const scroll = Number.isFinite(scrollDelta) ? scrollDelta : 0;
  let nearest = rows[0];
  let nearestDistance = Math.abs(
    nearest.top + nearest.height / 2 - scroll - centerY,
  );
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const distance = Math.abs(row.top + row.height / 2 - scroll - centerY);
    if (distance < nearestDistance) {
      nearest = row;
      nearestDistance = distance;
    }
  }
  return nearest.id;
}

export function storyDragOffset(items, sourceId, targetId, itemId) {
  const rows = validRows(items);
  const sourceIndex = rows.findIndex((row) => row.id === sourceId);
  const targetIndex = rows.findIndex((row) => row.id === targetId);
  const itemIndex = rows.findIndex((row) => row.id === itemId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    itemIndex < 0 ||
    sourceIndex === targetIndex
  ) {
    return 0;
  }

  const source = rows[sourceIndex];
  const target = rows[targetIndex];
  const displacedDistance = source.height + storyRowGap(rows);

  if (sourceIndex < targetIndex) {
    if (itemIndex === sourceIndex) {
      const finalTop = target.top + target.height - source.height;
      return finalTop - source.top;
    }
    return itemIndex > sourceIndex && itemIndex <= targetIndex
      ? -displacedDistance
      : 0;
  }

  if (itemIndex === sourceIndex) return target.top - source.top;
  return itemIndex >= targetIndex && itemIndex < sourceIndex
    ? displacedDistance
    : 0;
}
