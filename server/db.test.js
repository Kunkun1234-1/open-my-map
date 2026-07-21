import test from 'node:test';
import assert from 'node:assert/strict';
import { adminStats, getMap, listLibraryProjects, listMaps, listProjects } from './db.js';

test('seeded map data is internally consistent', () => {
  const maps = listMaps();
  const projects = listProjects();
  const stats = adminStats();
  assert.ok(maps.length >= 1);
  assert.ok(projects.length >= 1);
  assert.equal(stats.maps, maps.length);
  assert.equal(stats.projects, projects.length);
  assert.ok(maps.every((mapRecord) => Number.isInteger(mapRecord.project_id)));
  assert.equal(projects.reduce((count, project) => count + project.map_count, 0), maps.length);
  const map = getMap(maps[0].id);
  assert.ok(map.layers.length >= 1);
  assert.equal(map.layers.reduce((count, layer) => count + layer.features.length, 0), maps[0].feature_count);
  assert.ok(map.layers.flatMap((layer) => layer.features).every((feature) => Array.isArray(feature.attachments)));
  assert.ok(Number.isInteger(stats.attachments));
});

test('library project summaries omit admin-only owner fields', () => {
  const projects = listLibraryProjects();
  assert.ok(projects.length >= 1);
  assert.ok(projects.every((project) => project.status === 'active'));
  assert.ok(projects.every((project) => !Object.hasOwn(project, 'owner_email')));
  assert.ok(projects.every((project) => !Object.hasOwn(project, 'owner_user_id')));
  assert.ok(projects.every((project) => Number.isInteger(project.map_count)));
});
