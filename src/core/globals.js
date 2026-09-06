import { privateData } from './registry.js';
import { reactive } from './reactive.js';
import { dbFactory } from '../features/persistence.js';
import { mount } from '../features/mount.js';

/**
 * App resolution.
 *
 * Most of the runtime needs to know which app it is working for: which
 * delimiters to parse with, whose globals `global.x` names, whose routes
 * `$go()` navigates, whose `onError` hears about a failure. That answer is
 * carried by the element, put there by `snap()` from the block's definition
 * entry, and read back here.
 *
 * The default app is held in this module (rather than imported from
 * `src/index.js`, which imports everything) so that pure call sites,
 * `safeEval` used directly, and tests all have a sane fallback.
 */
export let defaultApp = null;

export const setDefaultApp = (app) => { defaultApp = app; };

/**
 * The app an element belongs to. Elements that never went through `snap()`
 * (a plain node, a detached element, a caller passing `document.body`) belong
 * to the default app.
 *
 * @param {Node} [el]
 * @returns {object} an app; never null once `Lego` has been created
 */
export const appOf = (el) => {
  const data = el && privateData.get(el);
  return (data && data.app) || defaultApp;
};

/**
 * Build an app's reactive globals.
 *
 * Every app gets its own `$route` (two apps on one page can show different
 * things for the same URL), its own `$go` (navigating through the app's own
 * routes and default router target) and its own seeded state. `$db` and
 * `$mount` are process-wide by nature: localStorage is one store, and a
 * mounted block finds its app through its own definition.
 *
 * @param {object} app - the app being built; only read lazily, inside $go
 * @param {object} [seed] - `options.globals` from createApp()
 * @returns {object} a reactive globals object
 */
export const createGlobals = (app, seed = {}) => reactive(Object.assign({
  $route: {
    url: typeof window !== 'undefined' ? window.location.pathname : '/',
    route: '',
    params: {},
    query: {},
    method: 'GET',
    body: null
  },
  $go: (path, ...targets) => app.router.go(path, ...targets)(document.body),
  $mount: (tagName, target, props) => mount(tagName, target, props),
  $db: dbFactory
}, seed));
