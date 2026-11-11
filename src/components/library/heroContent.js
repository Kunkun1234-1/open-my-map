export function getHeroTitle(t, slide, titles = []) {
  if (titles?.[slide]?.trim()) return titles[slide].trim();
  const defaultSlide = slide % 3;
  const suffix = defaultSlide === 0 ? '' : defaultSlide + 1;
  return `${t(`dashboard.heroTitle${suffix}`)}\n${t(`dashboard.heroTitleSecond${suffix}`)}`;
}

export function getHomeSlides(user) {
  if (Array.isArray(user?.homeSlides) && user.homeSlides.length) {
    return user.homeSlides.map((slide) => ({
      id: slide.id,
      title: slide.title || '',
      backgroundUrl: slide.backgroundUrl || '',
    }));
  }
  return Array.from({ length: 3 }, (_, index) => ({
    id: `legacy-${index}`,
    title: user?.homeHeroTitles?.[index] || '',
    backgroundUrl: user?.homeBackgroundUrls?.[index] ?? user?.homeBackgroundUrl ?? '',
  }));
}
