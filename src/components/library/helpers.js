import { DEFAULT_COVER_URLS } from './default-cover-assets.js';

export function relativeDate(value, lang) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return '—';
  const elapsed = Math.min(0, milliseconds - Date.now());
  const formatter = new Intl.RelativeTimeFormat(
    lang === 'zh' ? 'zh-CN' : 'en',
    { numeric: 'auto' },
  );
  for (const [unit, length] of [
    ['year', 31536000000],
    ['month', 2592000000],
    ['week', 604800000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ]) {
    if (Math.abs(elapsed) >= length)
      return formatter.format(Math.round(elapsed / length), unit);
  }
  return formatter.format(0, 'day');
}

export function defaultCoverUrl(entity, kind) {
  // Hash the identity rather than the list position so the cover survives sorting and renaming.
  const identity = `${kind}:${entity.id}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  }
  return DEFAULT_COVER_URLS[(hash >>> 0) % DEFAULT_COVER_URLS.length];
}

export function canManageMap(map, user) {
  return Boolean(
    user?.role === 'admin' ||
    map.is_owner ||
    map.my_role === 'owner' ||
    map.my_role === 'admin',
  );
}
