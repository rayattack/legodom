import { config } from '../utils/helpers.js';
import { resolveTargets } from '../utils/dom.js';

let snapFn = null;
export const setSnap = (fn) => { snapFn = fn; };

export const routes = [];

export const _matchRoute = async (targetQueries = null, contextEl = null) => {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  const match = routes.find(r => r.regex.test(path));
  if (config.debug) console.log('[Lego Trace] Matching route', path, match);
  if (!match) return;

  // Middleware check
  if (match.middleware) {
    const shouldProceed = await match.middleware({ path, params: {} }); // TODO: Parse params
    if (!shouldProceed) return;
  }

  if (targetQueries && contextEl && match.tagName) {
    const targets = targetQueries.flatMap(q => resolveTargets(q, contextEl));
    targets.forEach(t => {
      if (!t) return;
      t.innerHTML = `<${match.tagName}></${match.tagName}>`;
      if (snapFn) snapFn(t.firstElementChild);
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
