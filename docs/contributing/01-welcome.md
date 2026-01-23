# Topic 1: The Module Pattern & ES6 Architecture

LegoDOM has evolved from a monolithic **IIFE** to a modern **ES6 modular architecture**. The codebase is now organized in `src/` with clear separation of concerns.

## The New Structure

```
src/
├── index.js              # The Assembler - constructs the Lego global object
├── core/                 # Core framework functionality
│   ├── batcher.js       # Render queue management
│   ├── globals.js       # Global state ($route, $go, $db)
│   ├── lifecycle.js     # snap(), unsnap() - component lifecycle
│   ├── parser.js        # defineLegoFile() - runtime SFB parser
│   ├── reactive.js      # Proxy-based reactivity
│   ├── registry.js      # Internal storage (registry, privateData, forPools)
│   ├── renderer.js      # render(), bind() - DOM manipulation
│   └── stylesheets.js   # Scoped CSS management
├── directives/          # Extracted directive implementations
│   ├── b-for.js
│   ├── b-if.js
│   ├── b-show.js
│   ├── b-sync.js
│   ├── b-text.js
│   ├── b-html.js
│   └── index.js         # Directive registry
├── features/            # Optional features
│   ├── error.js         # Error boundaries
│   ├── persistence.js   # $db, localStorage management
│   └── router.js        # $go, $route
└── utils/               # Shared utilities
    ├── dom.js           # DOM helpers (escapeHTML, findAncestor, syncModelValue)
    ├── helpers.js       # Core utilities (resolve, createRegex, deriveBlockName)
    ├── lru-cache.js     # Expression cache
    ├── parser-utils.js  # parseLego() - shared SFB parser
    └── safe-eval.js     # Sandboxed evaluation
```

## Why Modular ES6?

The IIFE pattern served us well initially, but as the codebase grew past 1500 lines, maintainability became an issue. The modular structure offers:

1.  **Separation of Concerns**: Each module has a single, well-defined responsibility.
2.  **Testability**: Individual modules can be tested in isolation.
3.  **Tree-Shaking**: Build tools can eliminate unused code.
4.  **Developer Experience**: Easier to navigate and understand.
5.  **Circular Dependency Resolution**: `src/index.js` acts as a dependency injection container.

## The Assembler Pattern

`src/index.js` is the **entry point**. It doesn't contain business logic—it imports pieces and wires them together:

```js
import { snap, unsnap } from './core/lifecycle.js';
import { render, bind } from './core/renderer.js';
import { globalBatcher } from './core/batcher.js';
import { setErrorHandlers } from './features/error.js';

// Dependency Injection
globalBatcher.setHandler(render);
setErrorHandlers(snap, render);

// Construct the Lego object
const Lego = {
  snap,
  unsnap,
  block: (tagName, templateHTML, logic) => { 
    // Register block...
  },
  init: async (root) => {
    // Initialize framework...
  },
  // ... other methods
};

export { Lego };
export default Lego;
```

This pattern solves circular dependencies: `lifecycle.js` needs `renderer.js`, and `renderer.js` needs `lifecycle.js`. By injecting dependencies at runtime, we break the cycle.

### The use of `WeakMap`

You'll notice the use of `WeakMap` in `src/core/registry.js` for `privateData` and `forPools`.

-   **Why not a regular Map?** A `WeakMap` allows the keys (which are DOM elements) to be **garbage collected** if the element is removed from the DOM.
    
-   **Memory Leak Prevention:** If we used a regular `Map`, LegoDOM would hold a reference to every block ever created, even after deletion, eventually crashing the browser tab.
    

### Internal Registry

Located in `src/core/registry.js`:

```js
export const registry = {}; // tagName → <template> element
export const legoFileLogic = new Map(); // tagName → { mounted(), data, ... }
export const sharedStates = new Map(); // tagName → reactive singleton
export const privateData = new WeakMap(); // element → { snapped, bindings, ... }
```

The `registry` acts as LegoDOM's "brain." It stores the `<template>` elements that define what a block looks like. When you write `<my-button>`, Lego looks into this object to find the blueprint.
