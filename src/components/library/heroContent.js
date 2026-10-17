export function getHeroTitle(t, slide, titles = []) {
  if (titles?.[slide]?.trim()) return titles[slide].trim();
  const suffix = slide === 0 ? '' : slide + 1;
  return `${t(`dashboard.heroTitle${suffix}`)}\n${t(`dashboard.heroTitleSecond${suffix}`)}`;
}
