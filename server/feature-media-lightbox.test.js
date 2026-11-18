import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the production lightbox keyboard handler without loading React or media.
const source = readFileSync(new URL('../src/components/FeatureMediaGallery.jsx', import.meta.url), 'utf8');
const handlerStart = source.indexOf('    const handleKeyDown = (event) => {');
const handlerEnd = source.indexOf("    window.addEventListener('keydown'", handlerStart);
const handlerSource = source.slice(handlerStart, handlerEnd);

function button(name, document) {
  return {
    name,
    focus() { document.activeElement = this; },
  };
}

function runKey({ key, shiftKey = false, active = 'close' }) {
  const document = { activeElement: null };
  const controls = ['close', 'previous', 'next'].map((name) => button(name, document));
  document.activeElement = controls.find((control) => control.name === active) || null;
  const dialogRef = { current: { querySelectorAll: () => controls } };
  const actions = [];
  const handler = new Function('closeLightbox', 'moveLightbox', 'dialogRef', 'document', `
    ${handlerSource}
    return handleKeyDown;
  `)(() => actions.push('close'), (offset) => actions.push(offset), dialogRef, document);
  const event = {
    key,
    shiftKey,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  handler(event);
  return {
    actions,
    prevented: event.prevented,
    stopped: event.stopped,
    focused: document.activeElement?.name || null,
  };
}

test('lightbox owns Escape and arrow navigation without leaking to editor shortcuts', () => {
  assert.deepEqual(runKey({ key: 'Escape' }), {
    actions: ['close'], prevented: true, stopped: true, focused: 'close',
  });
  assert.deepEqual(runKey({ key: 'ArrowLeft' }), {
    actions: [-1], prevented: true, stopped: true, focused: 'close',
  });
  assert.deepEqual(runKey({ key: 'ArrowRight' }), {
    actions: [1], prevented: true, stopped: true, focused: 'close',
  });
  for (const key of ['Delete', 'Backspace', 'Enter', 'a']) {
    assert.deepEqual(runKey({ key }), {
      actions: [], prevented: false, stopped: true, focused: 'close',
    }, key);
  }
});

test('lightbox traps Tab at both ends while leaving internal Tab order intact', () => {
  assert.deepEqual(runKey({ key: 'Tab', shiftKey: true, active: 'close' }), {
    actions: [], prevented: true, stopped: true, focused: 'next',
  });
  assert.deepEqual(runKey({ key: 'Tab', active: 'next' }), {
    actions: [], prevented: true, stopped: true, focused: 'close',
  });
  assert.deepEqual(runKey({ key: 'Tab', active: 'previous' }), {
    actions: [], prevented: false, stopped: true, focused: 'previous',
  });
});

test('lightbox keyboard listener registers and unregisters in capture phase', () => {
  const addStart = source.indexOf("window.addEventListener('keydown'", handlerEnd);
  const addSource = source.slice(addStart, source.indexOf('\n', addStart)).trim();
  const removeStart = source.indexOf("window.removeEventListener('keydown'", addStart);
  const removeSource = source.slice(removeStart, source.indexOf('\n', removeStart)).trim();
  const calls = [];
  const window = {
    addEventListener: (...args) => calls.push(['add', ...args]),
    removeEventListener: (...args) => calls.push(['remove', ...args]),
  };
  const handleKeyDown = () => {};
  new Function('window', 'handleKeyDown', addSource)(window, handleKeyDown);
  new Function('window', 'handleKeyDown', removeSource)(window, handleKeyDown);
  assert.deepEqual(calls, [
    ['add', 'keydown', handleKeyDown, true],
    ['remove', 'keydown', handleKeyDown, true],
  ]);
});
