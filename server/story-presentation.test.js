import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the production keyboard handler without loading the map SDK or media.
const source = readFileSync(new URL('../src/components/StoryPresentation.jsx', import.meta.url), 'utf8');
const ignoreSource = source.slice(source.indexOf('function ignoresStoryKeys'), source.indexOf('export default function'));
const keySource = source.slice(source.indexOf('    function handleKeyDown'), source.indexOf("    window.addEventListener('keydown'"));
class Element {
  constructor(tagName, interactiveAncestor = false) { this.tagName = tagName; this.interactiveAncestor = interactiveAncestor; }
  closest() { return this.interactiveAncestor; }
}
function runKey({ index = 1, key = 'ArrowRight', target = new Element('DIV'), ...flags } = {}) {
  const selected = [];
  const records = [1, 2, 3].map((id) => ({ feature: { id }, layer: { id: 9 } }));
  const event = { key, target, ...flags, prevented: false, preventDefault() { this.prevented = true; } };
  const handle = new Function('Element', 'current', 'currentIndex', 'records', 'onSelect', `
    ${ignoreSource}
    ${keySource}
    return handleKeyDown;
  `)(Element, records[index], index, records, (feature) => selected.push(feature.id));
  handle(event);
  return { selected, prevented: event.prevented };
}

test('collapsed-panel story arrows select neighbors and stop at the first and last records', () => {
  assert.deepEqual(runKey(), { selected: [3], prevented: true });
  assert.deepEqual(runKey({ key: 'ArrowLeft' }), { selected: [1], prevented: true });
  assert.deepEqual(runKey({ index: 0, key: 'ArrowLeft' }), { selected: [], prevented: false });
  assert.deepEqual(runKey({ index: 2 }), { selected: [], prevented: false });
});

test('story navigation leaves video, audio, links, form controls and editable ancestors alone', () => {
  for (const tag of ['VIDEO', 'AUDIO', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']) {
    assert.deepEqual(runKey({ target: new Element(tag) }), { selected: [], prevented: false }, tag);
  }
  assert.deepEqual(runKey({ target: new Element('SPAN', true) }), { selected: [], prevented: false });
  for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
    assert.deepEqual(runKey({ [flag]: true }), { selected: [], prevented: false }, flag);
  }
});
