import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeroTitle, getHomeSlides } from '../src/components/library/heroContent.js';

const t = (key) => ({
  'dashboard.heroTitle': 'Map your ideas',
  'dashboard.heroTitleSecond': 'Explore the world',
  'dashboard.heroTitle2': 'Every place has a story',
  'dashboard.heroTitleSecond2': 'Make it yours',
  'dashboard.heroTitle3': 'Collect places',
  'dashboard.heroTitleSecond3': 'Share memories',
}[key] || key);

test('dynamic slides keep every image paired with its title and stable identity after reordering', () => {
  const slides = Array.from({ length: 5 }, (_, index) => ({ id: `slide-${index}`, title: `Heading ${index}`, backgroundUrl: `/api/auth/me/home-background?slide=slide-${index}&v=image-${index}` }));
  const reordered = [slides[4], slides[0], slides[2], slides[3], slides[1]];
  const visible = getHomeSlides({ homeSlides: reordered });
  assert.equal(visible.length, 5);
  assert.deepEqual(visible, reordered);
  assert.equal(getHeroTitle(t, 0, visible.map(slide => slide.title)), 'Heading 4');
  assert.equal(visible[0].backgroundUrl, slides[4].backgroundUrl);
});

test('legacy shared images and per-slide titles still populate the initial carousel', () => {
  assert.deepEqual(getHomeSlides({ homeBackgroundUrl: '/legacy-image', homeHeroTitles: ['First', '', 'Third'] }), [
    { id: 'legacy-0', title: 'First', backgroundUrl: '/legacy-image' },
    { id: 'legacy-1', title: '', backgroundUrl: '/legacy-image' },
    { id: 'legacy-2', title: 'Third', backgroundUrl: '/legacy-image' },
  ]);
});

test('single-slide configuration stays single and newly added slides receive readable defaults', () => {
  assert.equal(getHomeSlides({ homeSlides: [{ id: 'only', title: '', backgroundUrl: '' }] }).length, 1);
  assert.equal(getHeroTitle(t, 3), 'Map your ideas\nExplore the world');
  assert.equal(getHeroTitle(t, 4), 'Every place has a story\nMake it yours');
  assert.equal(getHeroTitle(t, 4, ['', '', '', '', '  Custom fifth slide  ']), 'Custom fifth slide');
});
