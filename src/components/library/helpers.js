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

export function coverStyle(map, index = 0) {
  const name = `${map.name || ''} ${map.description || ''}`.toLowerCase();
  let cover = Math.max(0, (Number(map.id) || index + 1) - 1) % 8;
  if (/coffee|咖啡/.test(name)) cover = 4;
  else if (/ski|滑雪/.test(name)) cover = 5;
  else if (/food|美食/.test(name)) cover = 6;
  else if (/hiking|徒步|登山/.test(name)) cover = 2;
  else if (/island|海岛/.test(name)) cover = 3;
  else if (/shanghai|上海/.test(name)) cover = 1;
  else if (/shenzhen|深圳/.test(name)) cover = 0;
  return {
    backgroundImage: `url(/images/cover-${['shenzhen', 'shanghai', 'mountain', 'island', 'coffee', 'ski', 'foodie', 'lake'][cover]}.webp)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

export function canManageMap(map, user) {
  return Boolean(
    user?.role === 'admin' ||
    map.is_owner ||
    map.my_role === 'owner' ||
    map.my_role === 'admin',
  );
}
