import { config } from '../utils/helpers.js';
import { resolveTargets } from '../utils/dom.js';
import { globals } from '../core/globals.js';

let snapFn = null;
let unsnapFn = null;
// `unsnapFn` is optional so existing single-argument callers keep working.
export const setSnap = (fn, unsnap = null) => { snapFn = fn; unsnapFn = unsnap; };

export const routes = [];

// Monotonic navigation token. Bumped on every _matchRoute entry so a slower
// in-flight navigation (e.g. one whose middleware is awaiting) can detect
// that a newer navigation has superseded it and abort before mutating the
// DOM or $route. Without this, two rapid clicks interleave and produce
// inconsistent state (second nav's $route + first nav's appended children).
let _navToken = 0;

export const findRoute = (path) => {
  const match = routes.find(r => r.regex.test(path));
  if (!match) return null;
  const values = path.match(match.regex).slice(1);
  const params = match.paramNames ? Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]])) : {};
  return { match, params };
};

export const _matchRoute = async (targetQueries = null, contextEl = null) => {
  if (typeof window === 'undefined') return;
  const token = ++_navToken;
  const isCurrent = () => token === _navToken;

  const path = window.location.pathname;
  const routeData = findRoute(path);

  if (config.debug) console.log('[Lego Trace] Matching route', path, routeData?.match);
  if (!routeData) return;

  const { match, params } = routeData;
  const search = window.location.search;

  // Middleware check FIRST — we don't commit $route or DOM until we know
  // this navigation is allowed to proceed AND is still the latest one.
  if (match.middleware) {
    const shouldProceed = await match.middleware({ path, params });
    if (!isCurrent()) return; // superseded mid-await
    if (!shouldProceed) return;
  }

  // Commit $route only once this navigation is the winner.
  globals.$route.url = path + search;
  globals.$route.route = match.path;
  globals.$route.params = params;
  globals.$route.query = Object.fromEntries(new URLSearchParams(search));

  const targetsToResolve = targetQueries && targetQueries.length ? targetQueries : ['lego-router'];
  const context = contextEl || document;

  if (match.tagName) {
    if (!isCurrent()) return;
    const targets = targetsToResolve.flatMap(q => resolveTargets(q, context));
    targets.forEach(t => {
      if (!t) return;
      if (!isCurrent()) return;
      // Same ordering guarantee as $mount: the outgoing page's unmounted()
      // must run before the incoming page's mounted(), and the custom
      // element's disconnect teardown is deferred by a microtask. unsnap is
      // idempotent, so that deferred call becomes a no-op.
      if (unsnapFn) [...t.children].forEach(child => unsnapFn(child));
      t.innerHTML = '';
      const child = document.createElement(match.tagName);
      t.appendChild(child);
      if (snapFn) snapFn(child);
    });
  }
};

/**
 * Universal Routing Helper
 */
export const _go = (path, ...targets) => (contextEl) => {
  const execute = async (method, body = null, pushState = true, opt = {}) => {
    if (pushState && typeof history !== 'undefined') {
      const serializedTargets = targets.filter(t => typeof t === 'string');
      const state = { legoTargets: serializedTargets, method, body };
      history.pushState(state, '', path);
    }
    await _matchRoute(targets.length ? targets : null, contextEl);
  };

  return {
    get: (push = true, opt = {}) => execute('GET', null, push, opt),
    post: (data, push = true, opt = {}) => execute('POST', data, push, opt),
    put: (data, push = true, opt = {}) => execute('PUT', data, push, opt),
    patch: (data, push = true, opt = {}) => execute('PATCH', data, push, opt),
    delete: (push = true, opt = {}) => execute('DELETE', null, push, opt)
  };
};
