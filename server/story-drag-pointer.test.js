import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getStoryDragTarget, storyDragOffset } from '../src/components/story-drag-utils.js';

// Drive the production pointer handlers with a controllable browser frame queue.
const source = readFileSync(new URL('../src/components/SharedMapViewer.jsx', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('  function startPointerDrag('), source.indexOf('\n  return <main'));

function pointerHarness() {
  const ids = [41, 42, 43];
  const frames = new Map();
  const captured = new Set();
  const saved = [];
  let nextFrame = 0;
  let preview = null;
  let focused = 0;
  const pointerDragRef = { current: null };
  const dragGhostRef = { current: null };
  const suppressClickUntil = { current: 0 };
  const scroller = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, right: 320, top: 80, bottom: 440 }),
  };
  const rows = ids.map((id, index) => ({
    dataset: { storyRecord: String(id) },
    getBoundingClientRect: () => ({ left: 0, top: 100 + index * 104, width: 320, height: 100 }),
  }));
  const node = {
    ...rows[0],
    closest: () => scroller,
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
    querySelector: () => ({ focus: () => { focused += 1; } }),
  };
  const requestFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  const setPreview = (value) => {
    preview = typeof value === 'function' ? value(preview) : value;
    if (preview && !dragGhostRef.current) dragGhostRef.current = { style: {} };
    if (!preview) dragGhostRef.current = null;
  };
  const api = new Function('deps', `
    const { getStoryDragTarget, storyDragOffset, pointerDragRef, dragGhostRef,
      recordListRef, setDragPreview, requestAnimationFrame, cancelAnimationFrame,
      suppressClickUntil, moveRecord } = deps;
    const canDrag = true;
    const recordOrderKey = '41,42,43';
    const mapData = { version: 7 };
    ${handlers}
    return { startPointerDrag, movePointerDrag, endPointerDrag };
  `)({
    getStoryDragTarget, storyDragOffset, pointerDragRef, dragGhostRef,
    recordListRef: { current: { querySelectorAll: () => rows } },
    setDragPreview: setPreview,
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: (id) => frames.delete(id),
    suppressClickUntil,
    moveRecord: (...args) => saved.push(args),
  });
  const event = (clientX = 100, clientY = 150, overrides = {}) => ({
    button: 0, pointerId: 9, pointerType: 'mouse', isPrimary: true,
    clientX, clientY, currentTarget: node, target: { closest: () => false },
    preventDefault() {}, ...overrides,
  });
  return {
    start: (e = event()) => api.startPointerDrag(e, 41),
    move: (e) => api.movePointerDrag(e),
    end: (e, cancelled) => api.endPointerDrag(e, cancelled),
    frame() {
      const entry = frames.entries().next().value;
      if (entry) { frames.delete(entry[0]); entry[1](); }
    },
    event, saved, captured, scroller, frames,
    preview: () => preview,
    ghost: () => dragGhostRef.current,
    pointer: () => pointerDragRef.current,
    focused: () => focused,
    suppressed: () => suppressClickUntil.current > 0,
  };
}

test('a click below the movement threshold remains a normal click without preview or save', () => {
  const h = pointerHarness();
  h.start();
  h.move(h.event(102, 152));
  assert.equal(h.preview(), null);
  h.end(h.event(102, 152));
  assert.deepEqual(h.saved, []);
  assert.equal(h.suppressed(), false);
});

test('drag frames update a floating preview and final pointerup saves the actual final target once', () => {
  const h = pointerHarness();
  h.start();
  h.move(h.event(120, 254));
  h.frame();
  assert.equal(h.preview().target, 42);
  assert.equal(h.preview().valid, true);
  assert.equal(h.ghost().style.transform, 'translate3d(20px, 204px, 0) rotate(1deg)');
  assert.equal(h.captured.has(9), true);
  h.end(h.event(130, 358));
  assert.deepEqual(h.saved, [[41, 43]], 'pointerup can precede the last animation frame');
  assert.equal(h.preview(), null);
  assert.equal(h.captured.size, 0);
  h.end(h.event(130, 358), true); // lostpointercapture after explicit release
  assert.deepEqual(h.saved, [[41, 43]]);
  h.frame();
  assert.equal(h.focused(), 1);
  assert.equal(h.frames.size, 0);
});

test('dropping outside the list restores the original positions and does not save', () => {
  const h = pointerHarness();
  h.start();
  h.move(h.event(120, 254));
  h.frame();
  h.move(h.event(500, 300));
  h.frame();
  assert.equal(h.preview().valid, false);
  assert.equal(h.preview().target, 41);
  h.end(h.event(500, 300));
  assert.deepEqual(h.saved, []);
  assert.equal(h.preview(), null);
  assert.equal(h.suppressed(), true);
});

test('escape or pointer cancellation releases capture and cancels pending animation without saving', () => {
  for (const reason of ['escape', 'pointercancel']) {
    const h = pointerHarness();
    h.start();
    h.move(h.event(120, 254));
    h.frame();
    h.end(reason === 'escape' ? null : h.event(120, 254), true);
    assert.equal(h.pointer(), null);
    assert.equal(h.preview(), null);
    assert.equal(h.captured.size, 0);
    assert.deepEqual(h.saved, []);
    h.frame();
    assert.equal(h.frames.size, 0);
  }
});

test('secondary pointers and touch scrolling cannot accidentally start or finish a sort', () => {
  const h = pointerHarness();
  h.start(h.event(100, 150, { pointerType: 'touch' }));
  assert.equal(h.pointer(), null, 'touch drags require the drag handle');
  h.start();
  h.move(h.event(120, 254, { pointerId: 10 }));
  assert.equal(h.preview(), null);
  h.end(h.event(120, 254, { pointerId: 10 }));
  assert.ok(h.pointer());
  h.end(h.event());
  assert.deepEqual(h.saved, []);
});
