import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportPadding } from '../src/components/map-engine-utils.js';

function mapContainer(mapRect, panels) {
  const root = { querySelectorAll: () => panels };
  return { getBoundingClientRect: () => mapRect, closest: () => root };
}

function panel(rect, { collapsed = false } = {}) {
  return {
    getBoundingClientRect: () => rect,
    classList: { contains: (name) => collapsed && name === 'collapsed' },
  };
}

test('desktop fit view clears the rendered left sidebar using AMap top-bottom-left-right order', () => {
  const container = mapContainer(
    { left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 },
    [panel({ left: 0, top: 64, right: 388, bottom: 900, width: 388, height: 836 })],
  );
  const padding = viewportPadding(container);
  // The sidebar ends at x=388; the route must start at least 16 px farther right.
  assert.deepEqual(padding, [40, 40, 404, 60]);
  assert.ok(padding[2] >= 404, 'left avoidance covers the actual sidebar edge');
  assert.equal(padding[1], 40, 'a side panel must not increase bottom avoidance');
});

test('phone fit view clears the visible bottom sheet without reserving a left sidebar', () => {
  const container = mapContainer(
    { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 },
    [panel({ left: 0, top: 460, right: 390, bottom: 844, width: 390, height: 384 })],
  );
  const padding = viewportPadding(container);
  // The sheet occupies the bottom 384 px; 16 px of clearance gives 400 px.
  assert.deepEqual(padding, [40, 400, 40, 60]);
  assert.ok(padding[1] >= 400, 'bottom avoidance covers the visible sheet and gap');
  assert.equal(padding[2], 40, 'the full-width bottom sheet does not reserve left space');
});

test('collapsed and offscreen panels leave only the default fit-view margins', () => {
  const mapRect = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 };
  const ignoredPanels = [
    panel({ left: 0, top: 460, right: 390, bottom: 844 }, { collapsed: true }),
    panel({ left: -390, top: 0, right: 0, bottom: 844 }),
    panel({ left: 0, top: 844, right: 390, bottom: 1228 }),
  ];
  for (const ignoredPanel of ignoredPanels) {
    assert.deepEqual(viewportPadding(mapContainer(mapRect, [ignoredPanel])), [40, 40, 40, 60]);
  }
});
