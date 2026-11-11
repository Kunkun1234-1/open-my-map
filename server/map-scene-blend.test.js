import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapSceneBlend } from '../src/components/map-scene-blend.js';

function harness({ empty = false, tainted = false, drawFails = false, overlayCanvas = false } = {}) {
  let canvasCopies = 0;
  let idsRemoved = 0;
  let mediaRemoved = 0;
  let appended;
  const makeNode = () => ({
    style: {}, dataset: {}, classList: { add() {} },
    removeAttribute() { idsRemoved += 1; },
    setAttribute() {}, remove() { this.removed = true; },
  });
  const copy = {
    getContext: () => ({
      drawImage() { if (drawFails) throw new Error('Unavailable'); canvasCopies += 1; },
      getImageData() {
        if (tainted) throw Object.assign(new Error('Origin restricted'), { name: 'SecurityError' });
        return { data: [0, 0, 0, empty ? 0 : 255] };
      },
    }),
  };
  const snapshot = makeNode();
  const transparent = { getContext: () => ({ ...copy.getContext(), getImageData: () => ({ data: [0, 0, 0, 0] }) }) };
  snapshot.querySelectorAll = (selector) => selector === 'canvas' ? (overlayCanvas ? [copy, transparent] : [copy])
    : selector === '[id]' ? [makeNode()]
      : [{ remove() { mediaRemoved += 1; } }];
  const surface = {
    parentElement: { append: (element) => { appended = element; } },
    ownerDocument: { createElement: makeNode },
    cloneNode: () => snapshot,
    querySelectorAll: () => Array.from({ length: overlayCanvas ? 2 : 1 }, () => ({ width: 100, height: 100 })),
  };
  return { surface, node: () => appended, copied: () => canvasCopies,
    idsRemoved: () => idsRemoved, mediaRemoved: () => mediaRemoved };
}

test('copies visible canvas pixels, removes duplicate IDs/media, and fades a noninteractive snapshot', () => {
  const h = harness();
  const blend = createMapSceneBlend(h.surface);
  assert.equal(h.copied(), 1);
  assert.equal(h.idsRemoved(), 2);
  assert.equal(h.mediaRemoved(), 1);
  assert.equal(h.node().dataset.blendKind, 'snapshot');
  assert.equal(h.node().inert, true);
  blend.update(.5, 4, -3);
  assert.equal(h.node().style.opacity, '0.5');
  assert.equal(h.node().style.transform, 'translate3d(-4px, 3px, 0)');
  blend.remove();
  assert.equal(h.node().removed, true);
});

test('empty WebGL frames and unavailable canvas copies use a subtle veil rather than a blank snapshot', () => {
  for (const options of [{ empty: true }, { drawFails: true }]) {
    const h = harness(options);
    const blend = createMapSceneBlend(h.surface);
    assert.equal(h.node().dataset.blendKind, 'veil');
    blend.update(0, 0, 0);
    assert.equal(Number(h.node().style.opacity), .22);
    blend.update(1, 0, 0);
    assert.equal(Number(h.node().style.opacity), 0);
    blend.remove();
    assert.equal(h.node().removed, true);
  }
});

test('a cross-origin tainted canvas remains displayable without exporting or reading pixels', () => {
  const h = harness({ tainted: true });
  createMapSceneBlend(h.surface);
  assert.equal(h.copied(), 1);
  assert.equal(h.node().dataset.blendKind, 'snapshot');
});

test('an intentionally transparent overlay canvas does not discard a visible base map', () => {
  const h = harness({ overlayCanvas: true });
  createMapSceneBlend(h.surface);
  assert.equal(h.copied(), 2);
  assert.equal(h.node().dataset.blendKind, 'snapshot');
});

test('unmounted surfaces do not create a transition overlay', () => {
  assert.equal(createMapSceneBlend(null), null);
  assert.equal(createMapSceneBlend({ parentElement: null }), null);
});
