import { registry, activeBlocks, legoFileLogic, getPrivateData, canDefine, definitionFrom } from './registry.js';
import { bProps } from '../directives/b-props.js';
import { snap, unsnap } from './lifecycle.js';
import { createBlockElementClass } from './element.js';
import { reactive } from './reactive.js';
import { globalBatcher } from './batcher.js';
import { createGlobals } from './globals.js';
import { setStyleConfig, loadStylesheets } from './stylesheets.js';
import { createConfig, mergeDescriptors } from '../utils/helpers.js';
import { defineLegoFile } from './parser.js';
import { dbFactory, initCrossTabSync } from '../features/persistence.js';
import { createRouter, ensureRouterListeners, registerRoutedApp } from '../features/router.js';
import { createEffect, watch as watchSource } from './effect.js';
import { mount } from '../features/mount.js';

/**
 * An app is a LegoDOM instance: its own config, globals, routes, shared block
 * states and plugins. The default export `Lego` is one of these, created with
 * the default config, so a page that never calls `createApp()` sees exactly
 * what it saw before.
 *
 * What an app does NOT own is the custom element name space. `customElements`
 * is per document, so a tag belongs to whichever app defined it first, and
 * every element carries the identity of its defining app on its private data.
 * That is the resolution path: element -> definition entry -> app.
 */

// A block tag must be lowercase, hyphenated and alphanumeric before the
// loader will fetch source for it.
const VALID_TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

const STUDIO_URL = 'https://unpkg.com/@legodom/studio@0.0.2/dist/lego-studio.js';

/**
 * Audit fix #36: shared allowlist gate. Lazy-loaded blocks (whether
 * discovered via config.loader or pre-registered from a manifest) all run as
 * JS via `new Function` once their .lego is fetched, so the tag-name
 * allowlist applies equally to both paths.
 */
const matchesAllowlist = (allowlist, tagName) => {
  if (!allowlist) return true;
  const list = Array.isArray(allowlist) ? allowlist : [allowlist];
  return list.some(p => {
    if (typeof p === 'string') return p === tagName;
    if (typeof p === 'function') return !!p(tagName);
    // Duck-type RegExp (cross-realm safe).
    if (p && typeof p.test === 'function') return !!p.test(tagName);
    return false;
  });
};

/**
 * Resolve manifest headers at fetch time. A value may be a literal, a
 * function, `$db.some.key` or `$globals.some.key`, so an auth token is read
 * when the request goes out rather than when the manifest was declared.
 */
const resolveHeaders = (app, headers) => {
  if (!headers) return {};
  const resolved = {};
  Object.entries(headers).forEach(([key, val]) => {
    if (typeof val === 'function') {
      resolved[key] = val();
      return;
    }
    if (typeof val === 'string' && val.startsWith('$db.')) {
      resolved[key] = app.db(val.slice(4)).get();
      return;
    }
    if (typeof val === 'string' && val.startsWith('$globals.')) {
      resolved[key] = app.globals[val.slice(9)];
      return;
    }
    resolved[key] = val;
  });
  return resolved;
};

/**
 * Snap every host that connected while the block's source was in flight.
 */
const snapPending = (app, tagName) => {
  const pending = app._pendingLazy[tagName];
  if (!pending) return;
  pending.forEach(el => {
    if (!el.isConnected || !registry[tagName]) return;
    if (getPrivateData(el).snapped) return;
    snap(el);
  });
  delete app._pendingLazy[tagName];
};

/**
 * Fetch one lazy block's source and define it against this app.
 */
const fetchLazyBlock = async (app, tagName, url, fetchConfig, host) => {
  app._fetching.add(tagName);
  try {
    const method = url.startsWith('POST:') ? 'POST' : 'GET';
    const cleanUrl = url.replace(/^POST:/, '');
    const headers = resolveHeaders(app, fetchConfig.headers);
    const req = await fetch(cleanUrl, { method, headers, credentials: fetchConfig.credentials });
    if (!req.ok) {
      throw new Error(`HTTP ${req.status} loading block "${tagName}" from ${cleanUrl}`);
    }
    app.defineLegoFile(await req.text(), `${tagName}.lego`);
    if (registry[tagName]) snap(host);
    snapPending(app, tagName);
  } catch (e) {
    console.error(`[Lego] Failed to load manifest block ${tagName}:`, e);
  } finally {
    app._fetching.delete(tagName);
  }
};

/**
 * Define the custom element for a manifest entry now, and fetch its source on
 * the first connect. Shared lifecycle (snap on connect, deferred unsnap on
 * disconnect) comes from createBlockElementClass; the loader callback only
 * runs while the block is not in the registry yet.
 */
const registerLazy = (app, tagName, url, fetchConfig = {}) => {
  if (customElements.get(tagName)) return;

  // Audit fix #36: a lazy block's .lego is fetched and run as JS on first
  // mount, so it gets the same shape + allowlist checks as auto-discovery.
  if (!VALID_TAG.test(tagName)) {
    console.warn(`[Lego] Manifest skipped malformed tag "${tagName}"`);
    return;
  }
  if (!matchesAllowlist(app.config.loaderAllowlist, tagName)) {
    console.warn(`[Lego] Manifest skipped "${tagName}": not in loaderAllowlist`);
    return;
  }

  const loadBlock = (host) => {
    if (!app._fetching.has(tagName)) return fetchLazyBlock(app, tagName, url, fetchConfig, host);
    if (!app._pendingLazy[tagName]) app._pendingLazy[tagName] = new Set();
    app._pendingLazy[tagName].add(host);
  };

  customElements.define(tagName, createBlockElementClass(tagName, { lazyLoader: loadBlock }));
};

/** Fetch a manifest that was given as a URL, or as an object carrying one. */
const fetchManifest = async (app, manifest) => {
  const isAuthed = manifest.url && typeof manifest.url === 'string';
  const url = isAuthed ? manifest.url : manifest;
  const opts = isAuthed
    ? { headers: resolveHeaders(app, manifest.headers), credentials: manifest.credentials }
    : undefined;
  try {
    const r = await fetch(url, opts);
    return await r.json();
  } catch (e) {
    console.error('[Lego] Failed to load manifest:', e);
    return [];
  }
};

/**
 * Pre-register every block a manifest names. Two shapes are accepted per
 * group: `legos: ['name']` (URL derived from base + suffix) and
 * `map: { name: url }`.
 */
const loadManifest = async (app, manifest) => {
  let m = manifest;
  const needsFetch = typeof m === 'string' || (m.url && typeof m.url === 'string');
  if (needsFetch) m = await fetchManifest(app, m);

  const groups = Array.isArray(m) ? m : [m];
  groups.forEach(group => {
    const base = group.base || '';
    const suffix = group.suffix === true ? '.lego' : (group.suffix || '');
    const fetchConfig = { headers: group.headers || {}, credentials: group.credentials };

    if (group.legos) {
      group.legos.forEach(name => registerLazy(app, name, `${base}${name}${suffix}`, fetchConfig));
    }
    if (!group.map) return;
    Object.entries(group.map).forEach(([name, url]) => {
      const fullUrl = url.match(/^https?:|^\//) ? url : `${base}${url}`;
      registerLazy(app, name, fullUrl, fetchConfig);
    });
  });
};

/**
 * Should this unknown tag be handed to `config.loader`? Reports the reason
 * when it should not, so a silently skipped tag is discoverable in debug.
 */
const isDiscoverable = (app, tagName) => {
  if (app._fetching.has(tagName)) return false;
  // Reject malformed tag names (defense against attacker-controlled tags
  // reaching the loader, e.g. via b-html or untrusted markup).
  if (!VALID_TAG.test(tagName)) {
    if (app.config.debug) console.warn(`[Lego] Loader skipped malformed tag "${tagName}"`);
    return false;
  }
  if (matchesAllowlist(app.config.loaderAllowlist, tagName)) return true;
  if (app.config.debug) console.warn(`[Lego] Loader skipped "${tagName}": not in loaderAllowlist`);
  return false;
};

/**
 * Auto-Discovery: watch for unknown tags to lazy-load (HTMX-style / server
 * blocks). Every block the loader brings in belongs to this app.
 */
const setupDiscovery = (app, root) => {
  let warnedNoAllowlist = false;

  const fetchUnknown = (tagName) => {
    if (!app.config.loaderAllowlist && !warnedNoAllowlist) {
      warnedNoAllowlist = true;
      console.warn('[Lego] config.loader is set without config.loaderAllowlist. Any unknown hyphenated tag inserted into the page will trigger a fetch. Set Lego.config.loaderAllowlist to restrict this.');
    }

    app._fetching.add(tagName);
    const result = app.config.loader(tagName);
    if (!result) return;
    const promise = (typeof result === 'string') ? fetch(result).then(r => r.text()) : result;
    Promise.resolve(promise)
      .then(legoFile => {
        app.defineLegoFile(legoFile, `${tagName}.lego`);
        app._fetching.delete(tagName);
      })
      .catch(e => {
        console.error(`[Lego] Failed to load ${tagName}:`, e);
        app._fetching.delete(tagName);
      });
  };

  const discover = (n) => {
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const tagName = n.tagName.toLowerCase();
    const unknown = tagName.includes('-') && !registry[tagName] && !activeBlocks.has(n);
    if (unknown && isDiscoverable(app, tagName)) fetchUnknown(tagName);

    // Recursively check children for other unknown blocks.
    let child = n.firstElementChild;
    while (child) {
      discover(child);
      child = child.nextElementSibling;
    }
  };

  // Disconnect any previous discovery observer to avoid duplicates on re-init
  if (app._discoveryObserver) app._discoveryObserver.disconnect();
  app._discoveryObserver = new MutationObserver(m => m.forEach(r => {
    r.addedNodes.forEach(discover);
  }));
  // Observe with subtree to catch deep injections
  app._discoveryObserver.observe(root, { childList: true, subtree: true });

  // Audit fix #18: `discover` already recurses into children (it has to,
  // since the MutationObserver only yields the root of each inserted
  // subtree), so a single pass over the top-level children is enough.
  let child = root.firstElementChild;
  while (child) {
    discover(child);
    child = child.nextElementSibling;
  }
};

/**
 * Turn a route path into a regex, collecting `:param` names.
 *
 * Audit fix #40: `*` is a wildcard wherever it appears, not only when the
 * whole path is `*`. The previous special case escaped it back into a literal
 * ".*", so the catch-all route matched nothing.
 */
const compilePath = (path, paramNames) => path.replace(/:([^\/]+)|\*|[.+?^${}()|[\]\\]/g, (match, name) => {
  if (name) {
    paramNames.push(name);
    return '([^/]+)';
  }
  if (match === '*') return '.*';
  return '\\' + match;
});

/**
 * Read the block definition knobs out of either call shape of `block()`.
 */
const readBlockArgs = (args) => {
  const [templateHTML, logic, styles, cascade, error, props] = args;
  if (!templateHTML || typeof templateHTML !== 'object') {
    return {
      template: templateHTML,
      logic: logic || {},
      styles: styles || '',
      cascade: cascade || '',
      error: error || '',
      props: props || '',
      shadow: true,
      form: false
    };
  }
  const opts = templateHTML;
  return {
    template: opts.template || '',
    logic: opts.logic || {},
    styles: opts.styles || '',
    cascade: opts.cascade || '',
    error: opts.error || '',
    props: opts.props || '',
    shadow: opts.shadow !== false,
    form: opts.form === true
  };
};

/** Build the `<template>` that backs a definition made in JavaScript. */
const buildTemplate = (tagName, def) => {
  const t = document.createElement('template');
  t.setAttribute('b-id', tagName);
  t.setAttribute('b-stylesheets', def.styles);
  if (def.cascade) t.setAttribute('b-cascade', def.cascade);
  if (def.error) t.setAttribute('b-error', def.error);
  if (def.props) t.setAttribute('b-props', def.props);
  if (!def.shadow) t.setAttribute('b-shadow', 'false');
  if (def.form) t.setAttribute('b-form', '');
  t.innerHTML = def.template;
  return t;
};

/**
 * Re-snap live instances after a block is redefined (HMR).
 */
const upgradeInstances = (tagName) => {
  document.querySelectorAll(tagName).forEach(el => {
    unsnap(el);
    snap(el);
  });
  // Also catch instances in shadow roots
  activeBlocks.forEach(block => {
    if (!block._legoShadow) return;
    block._legoShadow.querySelectorAll(tagName).forEach(instance => {
      unsnap(instance);
      snap(instance);
    });
  });
};

/**
 * Create a LegoDOM application instance.
 *
 * @param {object} [options]
 * @param {object} [options.config] - merged over a fresh copy of the defaults
 *   (`syntax`, `strict`, `debug`, `onError`, `sanitize`, `loaderAllowlist`,
 *   `metrics`, `loader`).
 * @param {object} [options.globals] - seeds the app's reactive globals, which
 *   always also carry `$route`, `$go`, `$mount` and `$db`.
 * @param {object} [internals] - not public. Lets `src/index.js` build the
 *   default app around the module level config object so that
 *   `Lego.config.x = y` and `import { config }` keep pointing at the same
 *   thing they always did.
 * @returns {object} the app
 */
export const createApp = (options = {}, internals = {}) => {
  const config = internals.config || createConfig();
  Object.assign(config, options.config);

  const app = {
    config,
    /** Per app: `$registry('tag')` reads the shared state of this app's blocks. */
    sharedStates: new Map(),
    /** The element a route renders into unless a `b-target` says otherwise. */
    routerTarget: null,
    db: dbFactory,
    snap,
    unsnap,
    mount,
    createApp,
    // Lazy-load bookkeeping, per app because the blocks they define are.
    _fetching: new Set(),
    _pendingLazy: {},
    _discoveryObserver: null
  };

  app.router = createRouter(app);
  app.globals = createGlobals(app, options.globals);

  const plugins = new Set();
  let initCompleted = false;

  app.defineLegoFile = (content, filename) => defineLegoFile(app, content, filename);

  /**
   * Define a block.
   *
   * Two call shapes. The original positional one is unchanged:
   *   app.block(tag, templateHTML, logic, styles, cascade, error, props)
   * and an options object, which is the one to reach for once a block needs
   * anything past `props`:
   *   app.block(tag, { template, logic, styles, cascade, error, props,
   *                    shadow, form })
   * `shadow: false` renders the block into the light DOM; `form: true` makes
   * it form associated.
   *
   * A tag another app already defined is left alone: see canDefine().
   */
  app.block = (tagName, ...args) => {
    if (!canDefine(tagName, app)) return;
    const def = readBlockArgs(args);

    registry[tagName] = definitionFrom(buildTemplate(tagName, def), app);
    legoFileLogic.set(tagName, def.logic);
    bProps.register(tagName, def.props);

    try {
      const sharedState = {};
      mergeDescriptors(def.logic, sharedState);
      app.sharedStates.set(tagName.toLowerCase(), reactive(sharedState));
    } catch (e) {
      config.onError(e, 'define', tagName);
    }

    if (customElements.get(tagName)) {
      // HMR or re-definition: manually upgrade existing instances.
      upgradeInstances(tagName);
      return;
    }

    try {
      customElements.define(tagName, createBlockElementClass(tagName));
    } catch (e) {
      console.warn(`[Lego] Failed to register web component ${tagName}:`, e);
      // Audit fix #37: roll back the registry / supporting maps so a failed
      // define doesn't leave a stale definition that getLegos() reports as
      // registered and that future re-define attempts collide with.
      delete registry[tagName];
      legoFileLogic.delete(tagName);
      bProps.unregister(tagName);
      app.sharedStates.delete(tagName.toLowerCase());
    }
  };

  /**
   * Register a route on this app. Each app matches independently, so two apps
   * can answer the same URL by rendering different blocks.
   */
  app.route = (path, tagName, middleware = null) => {
    const paramNames = [];
    const entry = {
      path,
      regex: new RegExp(`^${compilePath(path, paramNames)}$`),
      tagName,
      paramNames,
      middleware
    };
    app.router.routes.push(entry);

    // Registered after init: nobody else will wire the listeners or run the
    // initial match for us. Identity check on the resolved route means we
    // only re-render when *this* route is the one that matches the current
    // location (findRoute takes the first match, and `entry` was appended
    // last, so an earlier route winning means nothing changed).
    if (!initCompleted) return;
    ensureRouterListeners();
    if (typeof window === 'undefined') return;
    const current = app.router.findRoute(window.location.pathname);
    if (current && current.match === entry) app.router.matchRoute();
  };

  /** Seed `$route` from the current location before the first match runs. */
  const seedRoute = () => {
    const path = window.location.pathname;
    const search = window.location.search;
    const routeData = app.router.findRoute(path);
    if (!routeData) return;
    const globals = app.globals;
    globals.$route.url = path + search;
    globals.$route.route = routeData.match.path;
    globals.$route.params = routeData.params;
    globals.$route.query = Object.fromEntries(new URLSearchParams(search));
    globals.$route.method = 'GET';
    globals.$route.body = null;
  };

  /** Adopt every inline `<template b-id>` in the document as this app's. */
  const registerInlineTemplates = () => {
    document.querySelectorAll('template[b-id]').forEach(t => {
      const tagName = t.getAttribute('b-id');
      if (!canDefine(tagName, app)) return;
      registry[tagName] = definitionFrom(t, app);
      bProps.register(tagName, t.getAttribute('b-props'));
      if (customElements.get(tagName)) return;
      customElements.define(tagName, createBlockElementClass(tagName));
    });
  };

  const loadStudio = () => {
    if (!registry['lego-studio']) {
      const script = document.createElement('script');
      script.src = STUDIO_URL;
      script.onerror = () => console.warn('[Lego] Failed to load Studio from CDN');
      document.head.appendChild(script);
    }
    app.route('/_/studio', 'lego-studio');
    app.route('/_/studio/:block', 'lego-studio');
  };

  /**
   * Initialize the app.
   *
   * @param {HTMLElement} [root] - subtree the loader's observer watches
   * @param {object} [options]
   * @param {string} [options.routerTarget] - selector routes render into when
   *   a link names no `b-target`. Defaults to `<lego-router>`. Two apps on one
   *   page each set their own, which is how they route side by side.
   */
  app.init = async (root = document.body, options = {}) => {
    if (!root || typeof root.nodeType !== 'number') root = document.body;
    setStyleConfig(options.styles || {});
    config.loader = options.loader;
    config.debug = options.debug === true;
    if (options.routerTarget) app.routerTarget = options.routerTarget;

    await loadStylesheets();

    if (app.router.routes.length > 0) seedRoute();

    registerInlineTemplates();

    if (options.manifest) await loadManifest(app, options.manifest);
    if (config.loader) setupDiscovery(app, root);
    if (options.studio) loadStudio();

    ensureRouterListeners();
    registerRoutedApp(app);
    initCompleted = true;
    if (app.router.routes.length > 0) app.router.matchRoute();

    initCrossTabSync();
  };

  /**
   * Install a plugin: `plugin.install(app, options)`, or `plugin(app, options)`
   * for a plain function. Once per app per plugin, so two apps on a page each
   * get their own installation and a repeat call is a no-op.
   * @returns {object} the app, for chaining
   */
  app.use = (plugin, pluginOptions) => {
    if (!plugin) return app;
    if (plugins.has(plugin)) return app;
    plugins.add(plugin);
    if (typeof plugin === 'function') plugin(app, pluginOptions);
    else if (typeof plugin.install === 'function') plugin.install(app, pluginOptions);
    else console.warn('[Lego] use() expects a function or an object with an install() method.');
    return app;
  };

  /**
   * Await the next render flush. Resolves once the batcher has committed the
   * DOM for the pending batch and run its `updated()` hooks (or, if nothing is
   * pending, after the next animation frame). The batcher is shared: one
   * frame renders every app's dirty blocks.
   * @returns {Promise<void>}
   */
  app.nextTick = () => globalBatcher.nextTick();

  /**
   * Run `fn` now and again whenever any reactive value it read changes.
   * Useful against this app's globals and `$registry` state, outside any block.
   * @returns {Function} stop
   */
  app.effect = (fn) => {
    const runner = createEffect(fn);
    runner.run();
    return () => runner.stop();
  };

  /**
   * Watch a value and call back when it changes. `source` is a dotted key
   * path read from this app's globals, or a function receiving them.
   * @returns {Function} stop
   */
  app.watch = (source, cb, watchOptions) => watchSource(source, cb, watchOptions, app.globals);

  app.getActiveBlocksCount = () => activeBlocks.size;

  /** The block names this app defined. Other apps' tags are not listed. */
  app.getLegos = () => Object.keys(registry).filter(tag => registry[tag].app === app);

  app.debug = {
    stylesheets: (el) => {
      if (!el || !el._studsMeta) return null;
      return el._studsMeta.stylesheets;
    }
  };

  return app;
};
