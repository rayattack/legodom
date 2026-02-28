import { registry, activeBlocks, legoFileLogic, sharedStates, getPrivateData, snapState } from './core/registry.js';
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
import { mount, setMountHandlers } from './features/mount.js';

// Dependency Injection Setup
globalBatcher.setHandler(render);
setErrorHandlers(snap, render);
setRouterSnap(snap);
setMountHandlers(snap, unsnap);

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
  $mount: (tagName, target, props) => mount(tagName, target, props),
  $db: dbFactory
}, typeof document !== 'undefined' ? document.body : null);

setGlobals(globalState);

const Lego = {
  db: dbFactory,
  snap,
  unsnap,
  mount,
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
            if (snapState.locked) return;
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
    // Escape regex metacharacters in static segments, then replace param placeholders
    regexPath = regexPath.replace(/:([^\/]+)|[.*+?^${}()|[\]\\]/g, (match, name) => {
      if (name) {
        paramNames.push(name);
        return '([^/]+)';
      }
      return '\\' + match;
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

    // 5. Register inline templates
    document.querySelectorAll('template[b-id]').forEach(t => {
      const tagName = t.getAttribute('b-id');
      registry[tagName] = t;

      if (!customElements.get(tagName)) {
        customElements.define(tagName, class extends HTMLElement {
          connectedCallback() {
            if (snapState.locked) return;
            if (registry[tagName]) snap(this);
          }
          disconnectedCallback() {
            unsnap(this);
          }
        });
      }
    });

    // 6. Process Manifest (Pre-registration for Shadow DOM support)
    const resolveHeaders = (headers) => {
      if (!headers) return {};
      const resolved = {};
      Object.entries(headers).forEach(([key, val]) => {
        if (typeof val === 'function') {
          resolved[key] = val();
        } else if (typeof val === 'string' && val.startsWith('$db.')) {
          // $db.auth.token
          const path = val.slice(4);
          // Simple get from persistence layer
          resolved[key] = Lego.db(path).get();
        } else if (typeof val === 'string' && val.startsWith('$globals.')) {
          // $globals.user.token
          const keyPath = val.slice(9);
          resolved[key] = globalsTarget[keyPath];
        } else {
          resolved[key] = val;
        }
      });
      return resolved;
    };

    const registerLazy = (tagName, url, config = {}) => {
      if (customElements.get(tagName)) return;

      customElements.define(tagName, class extends HTMLElement {
        async connectedCallback() {
          if (registry[tagName]) {
            if (!snapState.locked) snap(this);
            return;
          }

          if (!Lego._fetching) Lego._fetching = new Set();
          if (!Lego._pendingLazy) Lego._pendingLazy = {};
          if (Lego._fetching.has(tagName)) {
            if (!Lego._pendingLazy[tagName]) Lego._pendingLazy[tagName] = new Set();
            Lego._pendingLazy[tagName].add(this);
            return;
          }
          Lego._fetching.add(tagName);

          try {
            const method = url.startsWith('POST:') ? 'POST' : 'GET';
            const cleanUrl = url.replace(/^POST:/, '');

            // Resolve headers at runtime (just-in-time)
            const headers = resolveHeaders(config.headers);

            const fetchOpts = {
              method,
              headers,
              credentials: config.credentials
            };

            const req = await fetch(cleanUrl, fetchOpts);
            const content = await req.text();

            Lego.defineLegoFile(content, `${tagName}.lego`);

            if (registry[tagName]) snap(this);

            // Snap all elements that connected while the fetch was in progress
            const pending = Lego._pendingLazy[tagName];
            if (pending) {
              pending.forEach(el => {
                if (el.isConnected && registry[tagName] && !getPrivateData(el).snapped) {
                  snap(el);
                }
              });
              delete Lego._pendingLazy[tagName];
            }
          } catch (e) {
            console.error(`[Lego] Failed to load manifest block ${tagName}:`, e);
          } finally {
            Lego._fetching.delete(tagName);
          }
        }
        disconnectedCallback() {
          unsnap(this);
        }
      });
    };

    if (options.manifest) {
      let m = options.manifest;

      // 1. Check for Object with URL (Auth Manifest)
      if (m.url && typeof m.url === 'string') {
        try {
          const headers = resolveHeaders(m.headers);
          const r = await fetch(m.url, { headers, credentials: m.credentials });
          m = await r.json();
        } catch (e) {
          console.error('[Lego] Failed to load manifest:', e);
          m = [];
        }
      }
      // 2. Check for String URL (Public Manifest)
      else if (typeof m === 'string') {
        try {
          const r = await fetch(m);
          m = await r.json();
        } catch (e) {
          console.error('[Lego] Failed to load manifest:', e);
          m = [];
        }
      }

      // Normalize to array
      const groups = Array.isArray(m) ? m : [m];

      for (const group of groups) {
        const base = group.base || '';
        const suffix = group.suffix === true ? '.lego' : (group.suffix || '');

        const config = {
          headers: group.headers || {},
          credentials: group.credentials
        };

        // 1. Array style: legos: ['name']
        if (group.legos) {
          group.legos.forEach(name => {
            registerLazy(name, `${base}${name}${suffix}`, config);
          });
        }
        // 2. Map style: map: { 'name': 'url' }
        if (group.map) {
          Object.entries(group.map).forEach(([name, url]) => {
            const fullUrl = url.match(/^https?:|^\//) ? url : `${base}${url}`;
            registerLazy(name, fullUrl, config);
          });
        }
      }
    }

    // Auto-Discovery: Watch for unknown tags to lazy-load (HTMX-style / Server Blocks)
    if (config.loader) {
      const discover = (n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const tagName = n.tagName.toLowerCase();
        if (tagName.includes('-') && !registry[tagName] && !activeBlocks.has(n)) {
          // Check if we are already fetching this tag to avoid dupes
          if (Lego._fetching && Lego._fetching.has(tagName)) return;

          if (!Lego._fetching) Lego._fetching = new Set();
          Lego._fetching.add(tagName);

          const result = config.loader(tagName);
          if (result) {
            const promise = (typeof result === 'string')
              ? fetch(result).then(r => r.text())
              : result;

            Promise.resolve(promise)
              .then(legoFile => {
                Lego.defineLegoFile(legoFile, `${tagName}.lego`);
                Lego._fetching.delete(tagName);
              })
              .catch(e => {
                console.error(`[Lego] Failed to load ${tagName}:`, e);
                Lego._fetching.delete(tagName);
              });
          }
        }
        // Recursively check children for other unknown blocks
        if (n.children.length > 0) {
          // Use lightweight iteration
          let child = n.firstElementChild;
          while (child) {
            discover(child);
            child = child.nextElementSibling;
          }
        }
      };

      // Disconnect any previous discovery observer to avoid duplicates on re-init
      if (Lego._discoveryObserver) Lego._discoveryObserver.disconnect();

      Lego._discoveryObserver = new MutationObserver(m => m.forEach(r => {
        r.addedNodes.forEach(discover);
      }));

      // Observe with subtree to catch deep injections
      Lego._discoveryObserver.observe(root, { childList: true, subtree: true });

      // Initial scan
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) discover(walker.currentNode);
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
