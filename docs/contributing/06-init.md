# In the beginning - `Lego.init()`

The `init()` function is the heart of LegoDOM. It orchestrates the entire initialization process, setting up the observer, connecting the global state, and processing existing blocks.

## Location in the Codebase

The `init()` method is defined in `src/index.js` as part of the exported `Lego` object:

```js
// src/index.js
import { snap, unsnap } from './core/lifecycle.js';
import { bind, render } from './core/renderer.js';
import { registry, activeBlocks, getPrivateData } from './core/registry.js';
import { config } from './utils/helpers.js';
import { setGlobals, globals } from './core/globals.js';
import { loadStylesheets } from './core/stylesheets.js';
import { routes, _go, _matchRoute } from './features/router.js';
import { initCrossTabSync } from './features/persistence.js';
import { defineLegoFile } from './core/parser.js';

const Lego = {
  init: async (root = document.body, options = {}) => {
    // 1. Validate root
    if (!root || typeof root.nodeType !== 'number') root = document.body;
    
    // 2. Configure
    setStyleConfig(options.styles || {});
    config.loader = options.loader;
    config.debug = options.debug === true;

    // 3. Load stylesheets
    await loadStylesheets();

    // 4. Initialize routing if configured
    if (routes.length > 0) {
      const path = window.location.pathname;
      const search = window.location.search;
      const match = routes.find(r => r.regex.test(path));
      if (match) {
        const values = path.match(match.regex).slice(1);
        const params = Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]]));
        const query = Object.fromEntries(new URLSearchParams(search));

        globals.$route.url = path + search;
        globals.$route.route = match.path;
        globals.$route.params = params;
        globals.$route.query = query;
        globals.$route.method = 'GET';
        globals.$route.body = null;
      }
    }

    // 5. Register inline templates
    document.querySelectorAll('template[b-id]').forEach(t => {
      registry[t.getAttribute('b-id')] = t;
    });

    // 6. Setup auto-loader if configured
    const checkAndLoad = (n) => {
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      snap(n);
      const tagName = n.tagName.toLowerCase();
      if (tagName.includes('-') && !registry[tagName] && config.loader && !activeBlocks.has(n)) {
        const result = config.loader(tagName);
        if (result) {
          const promise = (typeof result === 'string')
            ? fetch(result).then(r => r.text())
            : result;

          Promise.resolve(promise)
            .then(legoFile => Lego.defineLegoFile(legoFile, tagName + '.lego'))
            .catch(e => console.error(`[Lego] Failed to load ${tagName}:`, e));
        }
      }
    };

    // 7. Setup MutationObserver
    const observer = new MutationObserver(m => m.forEach(r => {
      r.addedNodes.forEach(checkAndLoad);
      r.removedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && unsnap(n));
    }));
    observer.observe(root, { childList: true, subtree: true });

    // 8. Process existing DOM
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    checkAndLoad(root);
    while (walker.nextNode()) checkAndLoad(walker.currentNode);

    // 9. Bind globals to root
    root._studs = globals;
    bind(root, root);
    render(root);

    // 10. Setup routing event listeners
    if (routes.length > 0) {
      window.addEventListener('popstate', (event) => {
        const targets = event.state?.legoTargets || null;
        _matchRoute(targets);
      });

      document.addEventListener('click', e => {
        const path = e.composedPath();
        const link = path.find(el => el.tagName === 'A' && (el.hasAttribute('b-target') || el.hasAttribute('b-link')));
        if (link) {
          e.preventDefault();
          const href = link.getAttribute('href');
          const targetAttr = link.getAttribute('b-target');
          const targets = targetAttr ? targetAttr.split(/\s+/).filter(Boolean) : [];

          const shouldPush = link.getAttribute('b-link') !== 'false';
          globals.$go(href, ...targets).get(shouldPush);
        }
      });
      _matchRoute();
    }

    // 11. Initialize cross-tab sync
    initCrossTabSync();
  },
  // ... other methods
};

export { Lego };
export default Lego;
```

## The Initialization Flow

### 1. Template Registration

The first thing `init()` does is look for blueprints you've already defined in your HTML.

```js
document.querySelectorAll('template[b-id]').forEach(t => {
  registry[t.getAttribute('b-id')] = t;
});
```

It scans the entire document for any `<template>` tag that has a `b-id` attribute. It then adds these to the `registry` object (from `src/core/registry.js`). This allows you to define blocks directly in your HTML file without writing a single line of JavaScript.

### 2. Stylesheet Loading

If you're using shared stylesheets, `init()` loads them:

```js
await loadStylesheets();
```

This is handled by `src/core/stylesheets.js` and uses the Constructable Stylesheets API for performance.

### 3. Setting up the Registry (`customElements`)

This is the most critical part of the initialization. LegoDOM registers your blocks as Native Web Components:

- **What it does**: It tells the browser that whenever it sees a tag like `<user-card>`, it should treat it as a special `LegoBlock`.
- **The Mechanism**: It calls `customElements.define('user-card', HTMLElement)`. 
- **The Reaction**: 
    - When a block is **added** (via HTML, JS, or `b-if`), the browser triggers `connectedCallback()` which calls `snap()`.
    - When a block is **removed**, the browser triggers `disconnectedCallback()` which calls `unsnap()`.
        

### 4. Auto-Discovery & Lazy Loading (v2.0+)

The `checkAndLoad` function enables server-side block loading:

```js
const checkAndLoad = (n) => {
  if (n.nodeType !== Node.ELEMENT_NODE) return;
  snap(n);
  const tagName = n.tagName.toLowerCase();
  if (tagName.includes('-') && !registry[tagName] && config.loader && !activeBlocks.has(n)) {
    const result = config.loader(tagName);
    if (result) {
      // Fetch and compile the block
      Promise.resolve(result)
        .then(legoFile => Lego.defineLegoFile(legoFile, tagName + '.lego'))
        .catch(e => console.error(`[Lego] Failed to load ${tagName}:`, e));
    }
  }
};
```

If `snap(n)` encounters an unknown block and `config.loader` is defined, it:
1. Calls the loader function with the tag name
2. Fetches the `.lego` file (or receives it directly)
3. Compiles it using `defineLegoFile()` from `src/core/parser.js`
4. Retries snapping the element

This enables the "HTMX+Blocks" pattern and server-side rendering.

### 5. The "First Snap"

After setting up the observer, it processes all existing elements:

```js
const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
checkAndLoad(root);
while (walker.nextNode()) checkAndLoad(walker.currentNode);
```

-   **Why?** The observer only sees _new_ things being added. It doesn't see what was already there when the page loaded.
    
-   By using a `TreeWalker`, LegoDOM efficiently processes every custom block that was present in the initial HTML.
    

### 6. Global Data Binding

The root element gets bound to the global state:

```js
root._studs = globals;
bind(root, root);
render(root);
```

This treats the entire root as if it were a giant block. This allows you to use reactive data in your "Light DOM" (the regular HTML outside of blocks) by referencing values stored in `Lego.globals` (from `src/core/globals.js`).

### 7. Routing Initialization

If you have defined any routes using `Lego.route()`, the `init` function sets up:

1. **History Management**: Listens for `popstate` events (back/forward buttons)
2. **Link Interception**: Captures clicks on `<a>` tags with `b-link` or `b-target` attributes
3. **Initial Route Match**: Calls `_matchRoute()` to render the current route

All routing logic is in `src/features/router.js`.

### 8. Cross-Tab Synchronization

Finally, `init()` enables localStorage synchronization across browser tabs:

```js
initCrossTabSync();
```

This is handled by `src/features/persistence.js` and allows `$db` properties to sync automatically.

---

**Summary of `init()`:** It finds templates, starts a "watchdog" for new elements, processes existing elements, enables global data, initializes routing, and sets up cross-tab sync. The entire initialization is modular, with each concern handled by its respective module in `src/`.
