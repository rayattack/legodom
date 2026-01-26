import { registry, activeBlocks, legoFileLogic, sharedStates, getPrivateData } from './core/registry.js';
import { snap, unsnap } from './core/lifecycle.js';
import { render, bind } from './core/renderer.js';
import { reactive } from './core/reactive.js';
import { createBatcher, globalBatcher } from './core/batcher.js';
import { setGlobals, globals as globalsTarget } from './core/globals.js';
import { setStyleConfig, loadStylesheets, styleRegistry } from './core/stylesheets.js';
import { config, mergeDescriptors } from './utils/helpers.js';
import { defineLegoFile } from './core/parser.js';
import { dbFactory, initCrossTabSync, handleDbUpdate } from './features/persistence.js';
import { _go, routes, setSnap as setRouterSnap, _matchRoute, setSnap, findRoute } from './features/router.js';
import { setErrorHandlers, findErrorBoundary } from './features/error.js';

// Dependency Injection Setup
globalBatcher.setHandler(render);
setErrorHandlers(snap, render);
setRouterSnap(snap);

// Initialize Globals
const browserRoute = {
  url: typeof window !== 'undefined' ? window.location.pathname : '/',
  route: '',
  params: {},
  query: {},
  method: 'GET',
  body: null
};

const globalState = reactive({
  $route: browserRoute,
  $go: (path, ...targets) => _go(path, ...targets)(document.body),
  $db: dbFactory
}, typeof document !== 'undefined' ? document.body : null);

setGlobals(globalState);

const Lego = {
  db: dbFactory,
  snap,
  unsnap,
  defineLegoFile: (content, filename) => defineLegoFile(Lego, content, filename),
  block: (tagName, templateHTML, logic = {}, styles = "", cascade = "", error = "") => {
    const t = document.createElement('template');
    t.setAttribute('b-id', tagName);
    t.setAttribute('b-stylesheets', styles);
    if (cascade) t.setAttribute('b-cascade', cascade);
    if (error) t.setAttribute('b-error', error);
    t.innerHTML = templateHTML;

    // HMR Optimization: REMOVED (Basic re-registration only)

    registry[tagName] = t;
    legoFileLogic.set(tagName, logic);

    try {
      const sharedState = {};
      mergeDescriptors(logic, sharedState);
      sharedStates.set(tagName.toLowerCase(), reactive(sharedState, document.body));
    } catch (e) {
      config.onError(e, 'define', tagName);
    }

    if (!customElements.get(tagName)) {
      try {
        customElements.define(tagName, class extends HTMLElement {
          connectedCallback() {
            // Defer if not yet registered (shouldn't happen via Lego.block, but good safety)
            if (registry[tagName]) snap(this);
          }
          disconnectedCallback() {
            unsnap(this);
          }
        });
      } catch (e) {
        console.warn(`[Lego] Failed to register web component ${tagName}:`, e);
      }
    } else {
      // HMR or Re-definition: manually upgrade existing instances
      document.querySelectorAll(tagName).forEach(el => {
        unsnap(el);
        snap(el);
      });
      // Also catch instances in shadow roots
      activeBlocks.forEach(block => {
        if (block._legoShadow) {
          block._legoShadow.querySelectorAll(tagName).forEach(instance => {
            unsnap(instance);
            snap(instance);
          });
        }
      });
    }
  },
  getActiveBlocksCount: () => activeBlocks.size,
  getLegos: () => Object.keys(registry),
  config,
  globals: globalState,
  route: (path, tagName, middleware = null) => {
    const paramNames = [];
    let regexPath = path === '*' ? '.*' : path;
    regexPath = regexPath.replace(/:([^\/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    routes.push({ path, regex: new RegExp(`^${regexPath}$`), tagName, paramNames, middleware });
  },
  debug: {
    stylesheets: (el) => {
      if (!el || !el._studsMeta) return null;
      return el._studsMeta.stylesheets;
    }
  },
  init: async (root = document.body, options = {}) => {
    if (!root || typeof root.nodeType !== 'number') root = document.body;
    setStyleConfig(options.styles || {});
    config.loader = options.loader;
    config.debug = options.debug === true;

    await loadStylesheets();

    if (routes.length > 0) {
      const path = window.location.pathname;
      const search = window.location.search;
      const routeData = findRoute(path);

      if (routeData) {
        const { match, params } = routeData;
        const query = Object.fromEntries(new URLSearchParams(search));

        globalState.$route.url = path + search;
        globalState.$route.route = match.path;
        globalState.$route.params = params;
        globalState.$route.query = query;
        globalState.$route.method = 'GET';
        globalState.$route.body = null;
      }
    }

    document.querySelectorAll('template[b-id]').forEach(t => {
      registry[t.getAttribute('b-id')] = t;
    });

    // Root-level hydration (if root itself is a block or has logic)
    if (root._studs) bind(root, root);
    else {
      root._studs = globalState;
      bind(root, root);
      render(root);
    }

    if (options.studio) {
      if (!registry['lego-studio']) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@legodom/studio@0.0.2/dist/lego-studio.js';
        script.onerror = () => console.warn('[Lego] Failed to load Studio from CDN');
        document.head.appendChild(script);
      }
      Lego.route('/_/studio', 'lego-studio');
      Lego.route('/_/studio/:block', 'lego-studio');
    }

    if (routes.length > 0) {
      window.addEventListener('popstate', (event) => {
        const targets = event.state?.legoTargets || null;
        _matchRoute(targets);
      });

      document.addEventListener('submit', e => {
        e.preventDefault();
      })

      document.addEventListener('click', e => {
        const path = e.composedPath();
        const link = path.find(el => el.tagName === 'A' && (el.hasAttribute('b-target') || el.hasAttribute('b-link')));
        if (link) {
          e.preventDefault();
          const href = link.getAttribute('href');
          const targetAttr = link.getAttribute('b-target');
          const targets = targetAttr ? targetAttr.split(/\s+/).filter(Boolean) : [];

          const shouldPush = link.getAttribute('b-link') !== 'false';
          globalState.$go(href, ...targets).get(shouldPush);
        }
      });
      _matchRoute();
    }

    initCrossTabSync();
  }
};

// Auto-expose to window if in browser
if (typeof window !== 'undefined') {
  window.Lego = Lego;
} else if (typeof global !== 'undefined') {
  global.Lego = Lego;
}

export { Lego };
export default Lego;
