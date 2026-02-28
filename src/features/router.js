import { config } from '../utils/helpers.js';
import { resolveTargets } from '../utils/dom.js';
import { globals } from '../core/globals.js';

let snapFn = null;
export const setSnap = (fn) => { snapFn = fn; };

export const routes = [];


export const findRoute = (path) => {
  const match = routes.find(r => r.regex.test(path));
  if (!match) return null;
  const values = path.match(match.regex).slice(1);
  const params = match.paramNames ? Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]])) : {};
  return { match, params };
};

export const _matchRoute = async (targetQueries = null, contextEl = null) => {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  const routeData = findRoute(path);

  if (config.debug) console.log('[Lego Trace] Matching route', path, routeData?.match);
  if (!routeData) return;

  const { match, params } = routeData;
  const search = window.location.search;

  // Update $route so components see current route data
  globals.$route.url = path + search;
  globals.$route.route = match.path;
  globals.$route.params = params;
  globals.$route.query = Object.fromEntries(new URLSearchParams(search));

  // Middleware check
  if (match.middleware) {
    const shouldProceed = await match.middleware({ path, params });
    if (!shouldProceed) return;
  }

  const targetsToResolve = targetQueries && targetQueries.length ? targetQueries : ['lego-router'];
  const context = contextEl || document;

  if (match.tagName) {
    const targets = targetsToResolve.flatMap(q => resolveTargets(q, context));
    targets.forEach(t => {
      if (!t) return;
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
