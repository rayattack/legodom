import { resolveTargets } from '../utils/dom.js';

let snapFn = null;
let unsnapFn = null;
// `unsnapFn` is optional so existing single-argument callers keep working.
export const setSnap = (fn, unsnap = null) => { snapFn = fn; unsnapFn = unsnap; };

/** The element a route renders into when nothing more specific is asked for. */
export const DEFAULT_ROUTER_TARGET = 'lego-router';

/**
 * A router belongs to an app.
 *
 * Routes, the navigation token and the default target are all per app, so two
 * apps on one page can answer the same URL by rendering different blocks into
 * different containers. The document level listeners below are shared (there
 * is one history stack, and one click on a link) and fan out to every app.
 *
 * @param {object} app - the owning app; `globals`, `config` and
 *   `routerTarget` are read lazily so the app can finish constructing itself.
 * @returns {{routes: Array, findRoute: Function, matchRoute: Function, go: Function}}
 */
export const createRouter = (app) => {
  const routes = [];

  // Monotonic navigation token. Bumped on every matchRoute entry so a slower
  // in-flight navigation (e.g. one whose middleware is awaiting) can detect
  // that a newer navigation has superseded it and abort before mutating the
  // DOM or $route. Without this, two rapid clicks interleave and produce
  // inconsistent state (second nav's $route + first nav's appended children).
  let navToken = 0;

  const findRoute = (path) => {
    const match = routes.find(r => r.regex.test(path));
    if (!match) return null;
    const values = path.match(match.regex).slice(1);
    const params = match.paramNames ? Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]])) : {};
    return { match, params };
  };

  const swapTargets = (targets, tagName, isCurrent) => {
    targets.forEach(t => {
      if (!t) return;
      if (!isCurrent()) return;
      // Same ordering guarantee as $mount: the outgoing page's unmounted()
      // must run before the incoming page's mounted(), and the custom
      // element's disconnect teardown is deferred by a microtask. unsnap is
      // idempotent, so that deferred call becomes a no-op.
      if (unsnapFn) [...t.children].forEach(child => unsnapFn(child));
      t.innerHTML = '';
      const child = document.createElement(tagName);
      t.appendChild(child);
      if (snapFn) snapFn(child);
    });
  };

  const matchRoute = async (targetQueries = null, contextEl = null) => {
    if (typeof window === 'undefined') return;
    const token = ++navToken;
    const isCurrent = () => token === navToken;

    const path = window.location.pathname;
    const routeData = findRoute(path);

    if (app.config.debug) console.log('[Lego Trace] Matching route', path, routeData?.match);
    if (!routeData) return;

    const { match, params } = routeData;
    const search = window.location.search;

    // Middleware check FIRST: we don't commit $route or DOM until we know
    // this navigation is allowed to proceed AND is still the latest one.
    if (match.middleware) {
      const shouldProceed = await match.middleware({ path, params });
      if (!isCurrent()) return; // superseded mid-await
      if (!shouldProceed) return;
    }

    // Commit $route only once this navigation is the winner.
    const globals = app.globals;
    globals.$route.url = path + search;
    globals.$route.route = match.path;
    globals.$route.params = params;
    globals.$route.query = Object.fromEntries(new URLSearchParams(search));

    if (!match.tagName) return;
    if (!isCurrent()) return;

    const fallback = app.routerTarget || DEFAULT_ROUTER_TARGET;
    const targetsToResolve = targetQueries && targetQueries.length ? targetQueries : [fallback];
    const context = contextEl || document;
    swapTargets(targetsToResolve.flatMap(q => resolveTargets(q, context)), match.tagName, isCurrent);
  };

  /**
   * Universal Routing Helper
   */
  const go = (path, ...targets) => (contextEl) => {
    const execute = async (method, body = null, pushState = true, opt = {}) => {
      if (pushState && typeof history !== 'undefined') {
        const serializedTargets = targets.filter(t => typeof t === 'string');
        const state = { legoTargets: serializedTargets, method, body };
        history.pushState(state, '', path);
      }
      await matchRoute(targets.length ? targets : null, contextEl);
    };

    return {
      get: (push = true, opt = {}) => execute('GET', null, push, opt),
      post: (data, push = true, opt = {}) => execute('POST', data, push, opt),
      put: (data, push = true, opt = {}) => execute('PUT', data, push, opt),
      patch: (data, push = true, opt = {}) => execute('PATCH', data, push, opt),
      delete: (push = true, opt = {}) => execute('DELETE', null, push, opt)
    };
  };

  return { routes, findRoute, matchRoute, go };
};

/**
 * Apps that have finished init() and therefore want to hear about navigation.
 * Insertion ordered, so on a page with two apps the one initialized first
 * renders first.
 */
const routedApps = new Set();

export const registerRoutedApp = (app) => routedApps.add(app);

const broadcast = (targets) => routedApps.forEach(app => app.router.matchRoute(targets));

let listenersInstalled = false;

/**
 * Install the document level navigation listeners, once per document.
 *
 * These used to live inside init() and were installed only when
 * `routes.length > 0` at that moment, so any route registered after init
 * (async bootstrap, code-split page module, a plugin) silently never matched.
 * Installation is now idempotent and independent of when the first route
 * shows up, and of how many apps the page runs.
 *
 * A click pushes history exactly once and then asks every app to match, so
 * two apps sharing a page also share one history stack.
 */
export const ensureRouterListeners = () => {
  if (listenersInstalled) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  listenersInstalled = true;

  window.addEventListener('popstate', (event) => {
    broadcast(event.state?.legoTargets || null);
  });

  document.addEventListener('submit', e => {
    if (e.target.hasAttribute('b-action')) {
      e.preventDefault();
    }
  });

  document.addEventListener('click', e => {
    const path = e.composedPath();
    const link = path.find(el => el.tagName === 'A' && (el.hasAttribute('b-target') || el.hasAttribute('b-link')));
    if (!link) return;
    // A modified click, a middle click or a link that asks for another
    // window is the reader telling the browser where to open it. Leave it to
    // the browser: taking it over would turn "open in a new tab" into a
    // navigation of this one.
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const linkTarget = link.getAttribute('target');
    if (linkTarget && linkTarget !== '_self') return;
    e.preventDefault();
    const href = link.getAttribute('href');
    const targetAttr = link.getAttribute('b-target');
    const targets = targetAttr ? targetAttr.split(/\s+/).filter(Boolean) : [];

    const shouldPush = link.getAttribute('b-link') !== 'false';
    if (shouldPush && typeof history !== 'undefined') {
      history.pushState({ legoTargets: targets, method: 'GET', body: null }, '', href);
    }
    broadcast(targets.length ? targets : null);
  });
};
