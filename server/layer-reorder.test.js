import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getStoryDragTarget, storyDragOffset } from '../src/components/story-drag-utils.js';
import { canStartLayerDrag } from '../src/components/editor/layer-reorder.js';

const source = readFileSync(new URL('../src/components/editor/layer-reorder.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/, '').replaceAll('export function', 'function');

// Exercise production listeners, frame scheduling, DOM cleanup and callbacks.
function harness({ mobile = false, ids = [11, 12, 13], sourceId = 11 } = {}) {
  const listeners = new Map();
  const frames = new Map();
  const captured = new Set();
  const commits = [];
  const finishes = [];
  let frameId = 0;
  let starts = 0;
  function node(rect = {}) {
    const classes = new Set();
    const children = [];
    return {
      children, parentElement: null, scrollTop: 0, clientHeight: 600, scrollHeight: 600,
      style: { removeProperty(key) { delete this[key]; } },
      classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key),
        contains: (key) => classes.has(key), toggle(key, value) { value ? classes.add(key) : classes.delete(key); } },
      setAttribute() {}, removeAttribute() {},
      getBoundingClientRect: () => ({ left: 0, right: 320, top: 80, bottom: 680, width: 320, height: 600, ...rect }),
      append(child) { children.push(child); child.parentElement = this; },
      remove() { this.removed = true; },
      querySelectorAll: () => [],
      cloneNode() { return node(rect); },
      addEventListener(type, callback) { listeners.set(`header:${type}`, callback); },
      removeEventListener(type) { listeners.delete(`header:${type}`); },
      setPointerCapture(id) { captured.add(id); },
      hasPointerCapture: (id) => captured.has(id),
      releasePointerCapture(id) {
        captured.delete(id);
        listeners.get('header:lostpointercapture')?.(event(100, 100));
      },
    };
  }
  const body = node();
  const root = node();
  const scroller = mobile ? node({ top: 20, bottom: 500 }) : root;
  scroller.clientHeight = 420;
  scroller.scrollHeight = 1000;
  if (mobile) root.parentElement = scroller;
  const rows = [
    node({ top: 100, height: 160, bottom: 260 }),
    node({ top: 260, height: 300, bottom: 560 }),
    node({ top: 560, height: 60, bottom: 620 }),
  ];
  const headers = rows.map((row) => node({ top: row.getBoundingClientRect().top, height: 36 }));
  rows.forEach((row, index) => { row.querySelector = () => headers[index]; });
  root.querySelectorAll = () => rows;
  const fakeWindow = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const api = new Function('deps', `
    const { getStoryDragTarget, storyDragOffset, window, document,
      getComputedStyle, requestAnimationFrame, cancelAnimationFrame } = deps;
    ${source}
    return startLayerReorder;
  `)({
    getStoryDragTarget, storyDragOffset, window: fakeWindow,
    document: { body, createElement: () => node() },
    getComputedStyle: (element) => ({ overflowY: element === scroller ? 'auto' : 'visible' }),
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const sourceIndex = ids.indexOf(sourceId);
  const startY = headers[sourceIndex].getBoundingClientRect().top + 15;
  function event(x = 100, y = startY, overrides = {}) {
    return { button: 0, isPrimary: true, pointerId: 7, pointerType: 'mouse',
      clientX: x, clientY: y, currentTarget: headers[sourceIndex], target: { closest: () => false },
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
  }
  return {
    start(overrides = {}) {
      return api(event(100, startY, overrides), { root, ids, sourceId,
        onStart: () => { starts += 1; }, onCommit: (ids) => commits.push(ids),
        onFinish: (active) => finishes.push(active) });
    },
    dispatch(type, e = event()) { listeners.get(type)?.(e); },
    frame(now = 16) {
      const entry = frames.entries().next().value;
      if (entry) { frames.delete(entry[0]); entry[1](now); }
    },
    event, listeners, frames, captured, commits, finishes, rows, root, scroller, body,
    starts: () => starts,
  };
}

test('title and handle can start mouse sorting, controls and non-primary pointers cannot', () => {
  const event = (selector, extras = {}) => ({ button: 0, pointerType: 'mouse',
    target: { closest: (query) => query.includes(selector) }, ...extras });
  assert.equal(canStartLayerDrag(event('.layer-name')), true);
  for (const selector of ['input', '.layer-expand', '[data-layer-menu-root]']) {
    assert.equal(canStartLayerDrag(event(selector)), false);
  }
  assert.equal(canStartLayerDrag(event('.layer-name', { button: 2 })), false);
  assert.equal(canStartLayerDrag(event('.layer-name', { isPrimary: false })), false);
  assert.equal(canStartLayerDrag(event('.layer-name', { pointerType: 'touch' })), false);
  assert.equal(canStartLayerDrag(event('.layer-drag-handle', { pointerType: 'touch' })), true);
});

test('ordinary click or slight movement does not start sorting or save', () => {
  const h = harness();
  h.start();
  h.dispatch('pointermove', h.event(102, 116));
  h.dispatch('pointerup', h.event(102, 116));
  assert.equal(h.starts(), 0);
  assert.deepEqual(h.commits, []);
  assert.deepEqual(h.finishes, [false]);
  assert.equal(h.listeners.size, 0);
});

test('ghost follows immediately, variable-height neighbors move, final pointerup saves once', () => {
  const h = harness();
  h.start();
  h.dispatch('pointermove', h.event(120, 280));
  const ghost = h.body.children[0];
  assert.equal(ghost.style.transform, 'translate3d(20px, 265px, 0)');
  assert.equal(h.rows[1].style.transform, 'translateY(-160px)');
  assert.equal(h.rows[0].style.transform, 'translateY(300px)');
  assert.equal(h.captured.size, 1);
  h.dispatch('pointerup', h.event(130, 580)); // no animation frame before release
  assert.deepEqual(h.commits, [[12, 13, 11]]);
  h.dispatch('header:lostpointercapture');
  assert.equal(h.commits.length, 1);
  assert.equal(ghost.removed, true);
  assert.equal(h.captured.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.rows[0].style.transform, undefined);
});

test('layer changes at header boundary rather than waiting for expanded body midpoint', () => {
  const h = harness();
  h.start();
  h.dispatch('pointermove', h.event(100, 205));
  h.dispatch('pointerup', h.event(100, 205));
  assert.deepEqual(h.commits, [[12, 11, 13]]);
});

test('upward drag displaces a taller neighbor by the complete source height', () => {
  const h = harness({ sourceId: 13 });
  h.start();
  h.dispatch('pointermove', h.event(100, 280));
  assert.equal(h.rows[1].style.transform, 'translateY(60px)');
  assert.equal(h.rows[2].style.transform, 'translateY(-300px)');
  h.dispatch('pointerup', h.event(100, 280));
  assert.deepEqual(h.commits, [[11, 13, 12]]);
});

test('scrolling updates drop targets from the original geometry without pointer movement', () => {
  const h = harness();
  h.start();
  h.dispatch('pointermove', h.event(100, 280));
  h.scroller.scrollTop = 300;
  h.frame();
  h.dispatch('pointerup', h.event(100, 280));
  assert.deepEqual(h.commits, [[12, 13, 11]]);
});

test('invalid horizontal and vertical drops restore original layout without saving', () => {
  for (const [x, y] of [[500, 280], [100, 50], [100, 720]]) {
    const h = harness();
    h.start();
    h.dispatch('pointermove', h.event(100, 280));
    h.dispatch('pointerup', h.event(x, y));
    assert.deepEqual(h.commits, []);
    assert.equal(h.frames.size, 0);
    assert.equal(h.root.classList.contains('is-layer-reordering'), false);
  }
});

test('Escape, blur, cancellation, lost capture and effect cleanup cancel with no write', () => {
  for (const reason of ['keydown', 'blur', 'pointercancel', 'header:lostpointercapture', 'cleanup']) {
    const h = harness();
    const cancel = h.start();
    h.dispatch('pointermove', h.event(100, 280));
    const e = h.event(100, 280, { key: 'Escape' });
    if (reason === 'cleanup') cancel();
    else h.dispatch(reason, e);
    assert.deepEqual(h.commits, [], reason);
    assert.equal(h.captured.size, 0, reason);
    assert.equal(h.listeners.size, 0, reason);
    assert.equal(h.frames.size, 0, reason);
    assert.equal(h.root.classList.contains('is-layer-reordering'), false);
    if (reason === 'keydown') {
      assert.equal(e.prevented, true);
      assert.equal(e.stopped, true);
    }
  }
});

test('desktop and mobile use the real scroller; mobile heading is not a drop zone', () => {
  for (const mobile of [false, true]) {
    const h = harness({ mobile });
    h.start();
    h.dispatch('pointermove', h.event(100, mobile ? 490 : 670));
    h.frame();
    assert.ok(h.scroller.scrollTop > 0);
    h.dispatch('pointerup', h.event(100, mobile ? 50 : 670));
    assert.deepEqual(h.commits, mobile ? [] : [[12, 13, 11]]);
  }
});

test('single-layer library does not attach a sorting gesture', () => {
  const h = harness({ ids: [11] });
  assert.equal(h.start(), null);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.body.children.length, 0);
});

test('feature drops still reorder within a layer, move between layers, and reject directions', () => {
  const panel = readFileSync(new URL('../src/components/editor/LayerPanel.jsx', import.meta.url), 'utf8');
  const helpers = panel.slice(panel.indexOf('function sameId('), panel.indexOf('function DefaultPinSymbol('));
  const handler = panel.slice(panel.indexOf('  const dropFeature = '), panel.indexOf('  const moveLayer = '));
  const saved = [];
  const layers = [
    { id: 1, name: 'First', features: [{ id: 21 }, { id: 22 }] },
    { id: 2, name: 'Second', features: [] },
    { id: 3, name: 'Route', kind: 'directions', features: [] },
  ];
  const drop = new Function('deps', `
    const { layers, onReorderFeatures, onMoveFeature, persist } = deps;
    const text = (zh) => zh;
    const setAnnouncement = () => {};
    ${helpers}
    ${handler}
    return dropFeature;
  `)({ layers, onReorderFeatures: 'reorder', onMoveFeature: 'move',
    persist: (operation, args) => saved.push([operation, args]) });
  drop({ kind: 'feature', id: 21, layerId: 1 }, layers[0], 2);
  drop({ kind: 'feature', id: 21, layerId: 1 }, layers[1], 0);
  drop({ kind: 'feature', id: 21, layerId: 1 }, layers[2], 0);
  drop({ kind: 'feature', id: 31, layerId: 3 }, layers[0], 0);
  assert.deepEqual(saved, [['reorder', [1, [22, 21]]], ['move', [21, 2, 0]]]);
});
