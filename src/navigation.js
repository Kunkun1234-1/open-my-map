const DEPTH_KEY = 'openMyMapNavigationDepth';

export function initializeNavigation() {
  if (!Number.isInteger(window.history.state?.[DEPTH_KEY])) {
    window.history.replaceState({ ...window.history.state, [DEPTH_KEY]: 0 }, '', window.location.href);
  }
}

export function navigate(path, { replace = false, state = {} } = {}) {
  initializeNavigation();
  if (!replace && new URL(path, window.location.href).href === window.location.href) {
    window.history.replaceState({ ...window.history.state, ...state }, '', path);
    return;
  }
  const depth = window.history.state[DEPTH_KEY];
  const nextState = { ...state, [DEPTH_KEY]: replace ? depth : depth + 1 };
  window.history[replace ? 'replaceState' : 'pushState'](nextState, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function canGoBack() {
  return Number.isInteger(window.history.state?.[DEPTH_KEY]) && window.history.state[DEPTH_KEY] > 0;
}

export function goBack(fallback = '/') {
  initializeNavigation();
  if (canGoBack()) window.history.back();
  else navigate(fallback, { replace: true });
}
