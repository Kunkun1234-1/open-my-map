import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStoryDragTarget,
  storyDragOffset,
} from '../src/components/story-drag-utils.js';

const rows = [
  { id: 'a', top: 10, height: 20 },
  { id: 'b', top: 36, height: 30 },
  { id: 'c', top: 72, height: 10 },
  { id: 'd', top: 88, height: 24 },
];

test('drag targets use initial row centers adjusted by scrolling', () => {
  assert.equal(getStoryDragTarget(rows, 20), 'a');
  assert.equal(getStoryDragTarget(rows, 52), 'b');
  assert.equal(getStoryDragTarget(rows, 72), 'c');
  assert.equal(getStoryDragTarget(rows, 72, 20), 'd');
  assert.equal(getStoryDragTarget(rows, -100), 'a');
  assert.equal(getStoryDragTarget(rows, 1000), 'd');
});

test('drag target lookup ignores invalid geometry and handles empty input', () => {
  const mixed = [
    { id: 'bad-top', top: Number.NaN, height: 20 },
    { id: 'valid', top: 40, height: 20 },
    { id: 'bad-height', top: 80, height: Infinity },
  ];
  assert.equal(getStoryDragTarget(mixed, 0), 'valid');
  assert.equal(getStoryDragTarget([], 0), null);
  assert.equal(getStoryDragTarget(null, 0), null);
  assert.equal(getStoryDragTarget(rows, Number.NaN), null);
});

test('downward preview moves the source to the target bottom and closes its gap', () => {
  assert.equal(storyDragOffset(rows, 'a', 'c', 'a'), 52);
  assert.equal(storyDragOffset(rows, 'a', 'c', 'b'), -26);
  assert.equal(storyDragOffset(rows, 'a', 'c', 'c'), -26);
  assert.equal(storyDragOffset(rows, 'a', 'c', 'd'), 0);
});

test('upward preview moves the source to the target top and opens its gap', () => {
  assert.equal(storyDragOffset(rows, 'c', 'a', 'c'), -62);
  assert.equal(storyDragOffset(rows, 'c', 'a', 'a'), 16);
  assert.equal(storyDragOffset(rows, 'c', 'a', 'b'), 16);
  assert.equal(storyDragOffset(rows, 'c', 'a', 'd'), 0);
});

test('offsets derive the non-negative row gap and reject invalid moves', () => {
  const overlapping = [
    { id: 1, top: 0, height: 30 },
    { id: 2, top: 25, height: 10 },
    { id: 3, top: 40, height: 15 },
  ];
  assert.equal(storyDragOffset(overlapping, 1, 3, 2), -30);
  assert.equal(storyDragOffset(rows, 'missing', 'b', 'a'), 0);
  assert.equal(storyDragOffset(rows, 'a', 'missing', 'a'), 0);
  assert.equal(storyDragOffset(rows, 'a', 'a', 'a'), 0);
  assert.equal(storyDragOffset(rows, 'a', 'b', 'missing'), 0);
});

test('drag calculations never mutate the captured row geometry', () => {
  const items = structuredClone(rows);
  const before = structuredClone(items);
  getStoryDragTarget(items, 70, 8);
  for (const item of items) storyDragOffset(items, 'd', 'a', item.id);
  assert.deepEqual(items, before);
});
