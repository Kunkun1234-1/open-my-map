import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COVER_URLS } from '../src/components/library/default-cover-assets.js';
import { defaultCoverUrl } from '../src/components/library/helpers.js';

test('default cover assignment uses the full set of twenty photos for both entity types', () => {
  assert.equal(DEFAULT_COVER_URLS.length, 20);
  const expectedPhotos = new Set(DEFAULT_COVER_URLS);
  assert.equal(expectedPhotos.size, 20);
  for (const kind of ['maps', 'projects']) {
    const assigned = new Set(Array.from({ length: 240 }, (_, index) =>
      defaultCoverUrl({ id: index + 1 }, kind)));
    assert.deepEqual(assigned, expectedPhotos);
  }
});

test('default cover stays fixed when entity metadata and features change or a custom cover is reset', () => {
  for (const kind of ['maps', 'projects']) {
    const original = { id: 12, name: 'Old name', cover_url: null, feature_count: 0 };
    const changed = { id: 12, name: 'New name', cover_url: '/protected/cover', feature_count: 4 };
    assert.equal(defaultCoverUrl(original, kind), defaultCoverUrl(changed, kind));
  }
});
