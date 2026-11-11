import test from 'node:test';
import assert from 'node:assert/strict';
import { canGoBack, goBack, initializeNavigation, navigate } from '../src/navigation.js';

function browserAt(path, state = {}) {
  const previousWindow = globalThis.window;
  const previousPopStateEvent = globalThis.PopStateEvent;
  const entries = [{ url: new URL(path, 'http://localhost:5173'), state }];
  let current = 0;
  const events = [];
  const location = {};
  Object.defineProperty(location, 'href', { get: () => entries[current].url.href });
  const history = {
    get state() { return entries[current].state; },
    pushState(nextState, _title, nextPath) {
      entries.splice(current + 1);
      entries.push({ url: new URL(nextPath, location.href), state: nextState });
      current += 1;
    },
    replaceState(nextState, _title, nextPath) {
      entries[current] = { url: new URL(nextPath, location.href), state: nextState };
    },
    back() { if (current > 0) current -= 1; },
    forward() { if (current + 1 < entries.length) current += 1; },
  };
  globalThis.PopStateEvent = class { constructor(type) { this.type = type; } };
  globalThis.window = { history, location, dispatchEvent: event => events.push(event.type) };
  return {
    history, events,
    path: () => entries[current].url.pathname + entries[current].url.search,
    restore() { globalThis.window = previousWindow; globalThis.PopStateEvent = previousPopStateEvent; },
  };
}

test('previous page preserves the library filter through map and settings navigation', () => {
  const browser = browserAt('/');
  try {
    navigate('/?section=maps&tab=created&view=grid');
    navigate('/maps/17');
    navigate('/me');
    goBack();
    assert.equal(browser.path(), '/maps/17');
    goBack();
    assert.equal(browser.path(), '/?section=maps&tab=created&view=grid');
    browser.history.forward();
    assert.equal(browser.path(), '/maps/17');
  } finally { browser.restore(); }
});

test('reselecting the current page or filter does not add redundant back steps', () => {
  const browser = browserAt('/');
  try {
    navigate('/?section=maps');
    navigate('/?section=maps');
    navigate('/?section=maps&tab=created');
    navigate('/?section=maps&tab=created');
    goBack();
    assert.equal(browser.path(), '/?section=maps');
    goBack();
    assert.equal(browser.path(), '/');
  } finally { browser.restore(); }
});

test('direct preview links fall back to the editor, then the library without getting stuck', () => {
  const browser = browserAt('/maps/17?preview=1');
  try {
    goBack('/maps/17');
    assert.equal(browser.path(), '/maps/17');
    goBack();
    assert.equal(browser.path(), '/');
    assert.deepEqual(browser.events, ['popstate', 'popstate']);
  } finally { browser.restore(); }
});

test('initialization preserves existing view state and tracked history survives reinitialization', () => {
  const browser = browserAt('/?section=projects', { projectView: 'grid' });
  try {
    initializeNavigation();
    assert.equal(browser.history.state.projectView, 'grid');
    navigate('/me');
    initializeNavigation();
    goBack();
    assert.equal(browser.path(), '/?section=projects');
  } finally { browser.restore(); }
});

test('replacing a navigation does not create a duplicate previous page', () => {
  const browser = browserAt('/');
  try {
    navigate('/maps/17');
    navigate('/maps/17?preview=1', { replace: true });
    goBack();
    assert.equal(browser.path(), '/');
  } finally { browser.restore(); }
});

test('direct login has no previous app page, while sign-in from a public map can return', () => {
  const browser = browserAt('/login');
  try {
    assert.equal(canGoBack(), false);
    navigate('/view/public-map', { replace: true });
    navigate('/login');
    assert.equal(canGoBack(), true);
    goBack('/login');
    assert.equal(browser.path(), '/view/public-map');
    assert.equal(canGoBack(), false);
  } finally { browser.restore(); }
});

test('logout replaces the protected entry and retains its signed-out marker', () => {
  const browser = browserAt('/');
  try {
    navigate('/me');
    navigate('/login', { replace: true, state: { loggedOut: true } });
    assert.equal(browser.path(), '/login');
    assert.equal(browser.history.state.loggedOut, true);
    goBack('/login');
    assert.equal(browser.path(), '/');
  } finally { browser.restore(); }
});
