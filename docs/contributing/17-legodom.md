# We Made It! The Public API

Everything we've discussed-the Scanner, the Registry, the Router, and the Snap-stays dormant until `Lego.init()` is called. This function is not just a starter; it's an orchestrator that synchronizes the JavaScript environment with the existing HTML on the page.

## The Lego Object: The Assembler

Location: `src/index.js`

The entire framework is assembled in this file:

```js
// src/index.js
import { snap, unsnap } from './core/lifecycle.js';
import { bind, render } from './core/renderer.js';
import { registry, legoFileLogic, sharedStates, activeBlocks } from './core/registry.js';
import { globalBatcher } from './core/batcher.js';
import { reactive } from './core/reactive.js';
import { config, mergeDescriptors } from './utils/helpers.js';
import { globals, setGlobals } from './core/globals.js';
import { routes, _go, _matchRoute } from './features/router.js';
import { Lego_db } from './features/persistence.js';
import { defineLegoFile } from './core/parser.js';

// Dependency Injection
globalBatcher.setHandler(render);
setGlobals({
  $go: _go,
  $db: Lego_db
});

const Lego = {
  // Core API
  init: async (root = document.body, options = {}) => {
    // ... (see Topic 6 for full implementation)
  },
  
  block: (tagName, templateHTML, logic = {}, styles = "", cascade = "", error = "") => {
    // Register a block programmatically
    const t = document.createElement('template');
    t.setAttribute('b-id', tagName);
    t.setAttribute('b-stylesheets', styles);
    if (cascade) t.setAttribute('b-cascade', cascade);
    if (error) t.setAttribute('b-error', error);
    t.innerHTML = templateHTML;
    
    registry[tagName] = t;
    legoFileLogic.set(tagName, logic);
    
    // Create reactive singleton for shared state
    const sharedState = {};
    mergeDescriptors(logic, sharedState);
    sharedStates.set(tagName.toLowerCase(), reactive(sharedState, document.body));
    
    // Upgrade existing elements
    document.querySelectorAll(tagName).forEach(snap);
  },
  
  defineLegoFile: (content, filename = 'block.lego') => {
    return defineLegoFile(Lego, content, filename);
  },
  
  // Routing API
  route: (path, tagName, options = {}) => {
    const paramNames = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    
    routes.push({
      path,
      tagName,
      regex: new RegExp(`^${pattern}$`),
      paramNames,
      guards: options.guards || []
    });
  },
  
  // Utilities
  snap,
  unsnap,
  db: Lego_db,
  globals,
  config
};

// Auto-expose to window
if (typeof window !== 'undefined') {
  window.Lego = Lego;
} else if (typeof global !== 'undefined') {
  global.Lego = Lego;
}

export { Lego };
export default Lego;
```

## The Lego Initializer

The `init()` function is deceptively small because its primary job is to flip the switches on the systems we've already built.

### 1. Bootstrapping the Watchdog
LegoDOM creates the Native Web Components registry.

### 2. The "Initial Snap" (The Recursive Wake-up)

Once the registry is live, the code walks the existing DOM:

```js
const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
checkAndLoad(root);
while (walker.nextNode()) checkAndLoad(walker.currentNode);
```

### The Logic Flow

1.  **Registry**: `Lego.block` calls `customElements.define`.
2.  **Detection**: Browser calls `connectedCallback` when element enters DOM.
3.  **Upgrade**: The callback executes `snap()`, creating Shadow DOM.
4.  **Binding**: `bind` scans for directives (`b-if`, `b-for`, etc).
5.  **Reactivity**: `reactive` creates proxies for state.
6.  **Rendering**: `render` updates the DOM based on state.

### Why not MutationObserver? (v2.0+)

Older versions used a global `MutationObserver`. We removed it because it couldn't detect changes inside Shadow DOMs boundaries. Native Web Components solve this universally.

### 3. Activating the Global Router

The **Router Hijack** (Topic 15) is installed:

```js
document.addEventListener('click', e => {
  const path = e.composedPath();
  const link = path.find(el => 
    el.tagName === 'A' && 
    (el.hasAttribute('b-target') || el.hasAttribute('b-link'))
  );
  
  if (link) {
    e.preventDefault();
    const href = link.getAttribute('href');
    const targets = link.getAttribute('b-target')?.split(/\s+/) || [];
    globals.$go(href, ...targets).get();
  }
});
```

-   Instead of attaching listeners to every `<a>` tag (slow and breaks when new links are added), it uses **Event Delegation**
-   It waits for clicks to bubble up to document, checks if they are `b-link` clicks, then triggers the router

### 4. The First Route Check

Finally, `init()` calls the router manually for the first time:

```js
if (routes.length > 0) {
  _matchRoute();
}
```

-   **The Why**: If a user navigates directly to `mysite.com/dashboard`, the browser loads the page, but the JavaScript needs to know which block to put into the router view immediately
-   This manual call ensures the UI matches the URL on the very first frame

### 5. Cross-Tab Sync Initialization

Enables localStorage synchronization:

```js
initCrossTabSync();
```

This sets up the `storage` event listener so `$db` properties sync across browser tabs.

## The Public API Surface

**Core Methods:**
- `Lego.init(root, options)` - Initialize the framework
- `Lego.block(name, html, logic, styles)` - Register a block
- `Lego.defineLegoFile(content, filename)` - Parse and register .lego content

**Routing:**
- `Lego.route(path, tagName, options)` - Register a route
- `Lego.globals.$go(path, ...targets)` - Navigate programmatically

**State:**
- `Lego.globals` - Global reactive state
- `Lego.db(key).default(value)` - Create persistent state

**Utilities:**
- `Lego.snap(el)` - Manually upgrade an element
- `Lego.unsnap(el)` - Manually teardown an element
- `Lego.config` - Framework configuration

## Zero-Config Philosophy

Lego is designed to be **Zero-Config**. By putting all initialization logic into `init()`, the developer only has to care about one thing: "When is my DOM ready?"

Simple usage:

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import Lego from './dist/lego.mjs';
    
    Lego.route('/home', 'home-page');
    Lego.route('/about', 'about-page');
    
    Lego.init();
  </script>
</head>
<body>
  <lego-router></lego-router>
</body>
</html>
```

The framework handles:
- Setting up the Registry
- Scanning existing DOM
- Registering event listeners
- Initializing the router
- Enabling cross-tab sync

## The Architecture "Why"

The code is layered to ensure correct timing:
1. **Setup Phase** (`import`): Modules load, dependencies resolve
2. **Wiring Phase** (top of index.js): Dependency injection (batcher gets render, globals get $go)
3. **Registration Phase** (user code): Define routes and blocks
4. **Initialization Phase** (`Lego.init()`): Start observer, scan DOM, activate router
5. **Runtime Phase**: Reactive updates, routing, persistence

This ensures:
- No circular dependency errors
- Modules can be tested in isolation
- The observer is watching before any blocks are created
- The router is ready before the first navigation

---

**Summary**: `Lego.init()` is the bridge that turns a static document into a reactive application. Defined in `src/index.js`, it orchestrates all the subsystems (lifecycle, renderer, router, persistence) into a cohesive whole. The modular architecture makes the codebase maintainable while the public API remains simple and intuitive.
