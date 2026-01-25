# Lego and the Brain: Global State Management

In Lego, the code is designed to allow a block in the footer to talk to a block in the header without them ever being "parents" or "children" of each other.

## Global State (`Lego.globals`) & The Observer Pattern

## Location in the Codebase

Global state is managed in `src/core/globals.js`:

```js
// src/core/globals.js
export const globals = {
  $route: {
    url: '',
    route: '',
    params: {},
    query: {},
    method: 'GET',
    body: null
  },
  $go: null,  // Injected by index.js
  $db: null   // Injected by index.js
};

export const setGlobals = (updates) => {
  Object.assign(globals, updates);
};
```

These globals are made available to every block via the base state in `src/core/lifecycle.js`:

```js
// src/core/lifecycle.js
const baseState = {
  $vars: {},
  $element: el,
  get $parent() { return findAncestor(el, '*') },
  $emit: (name, detail) => { ... },
  get $route() { return globals.$route },  // Reactive getter
  get $go() { return globals.$go }          // Reactive getter
};
```

## The "Why": Decoupling the Hierarchy

In most frameworks, data flows down like a waterfall. If a deeply nested block needs a piece of data, every parent above it must "pass it down." 

LegoDOM avoids this by creating a centralized, reactive hub. Any block can access globals through getters:

```html
<!-- In any block, anywhere in the tree -->
<template>
  <div>Current route: [[ $route.url ]]</div>
  <button @click="$go('/dashboard').get()">Dashboard</button>
</template>
```

## Database Persistence ($db)

The `$db` helper is defined in `src/features/persistence.js`:

```js
// src/features/persistence.js
import { globalBatcher } from '../core/batcher.js';

const DB_PREFIX = 'lego:';
const storageListeners = new Map();

export const initCrossTabSync = () => {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(DB_PREFIX)) return;
    
    const key = e.key.slice(DB_PREFIX.length);
    const listeners = storageListeners.get(key) || [];
    
    listeners.forEach(({ el, prop }) => {
      try {
        const newValue = JSON.parse(e.newValue);
        if (el._studs && el._studs[prop] !== newValue) {
          el._studs[prop] = newValue;
        }
      } catch (err) {
        console.error('[Lego] Cross-tab sync error:', err);
      }
    });
  });
};

export const Lego_db = (key) => {
  return {
    default: (defaultValue) => ({
      __isDbDescriptor: true,
      key,
      defaultValue
    })
  };
};

export const isDbDescriptor = (val) => {
  return val && typeof val === 'object' && val.__isDbDescriptor === true;
};

export const initializeDbProp = (obj, prop, descriptor, el, batcher) => {
  const { key, defaultValue } = descriptor;
  const storageKey = `${DB_PREFIX}${key}`;
  
  // Load from localStorage
  let value = defaultValue;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      value = JSON.parse(stored);
    }
  } catch (e) {
    console.error(`[Lego] Failed to load ${key}:`, e);
  }
  
  // Replace descriptor with actual value
  delete obj[prop];
  obj[prop] = value;
  
  // Register for cross-tab sync
  if (!storageListeners.has(key)) {
    storageListeners.set(key, []);
  }
  storageListeners.get(key).push({ el, prop });
  
  // Register for auto-save
  // (handled by handleDbUpdate during reactive proxy set trap)
};

export const handleDbUpdate = (target, prop, value) => {
  // Check if any registered listeners match this property
  for (const [key, listeners] of storageListeners.entries()) {
    const match = listeners.find(l => l.prop === prop);
    if (match) {
      const storageKey = `${DB_PREFIX}${key}`;
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch (e) {
        console.error(`[Lego] Failed to save ${key}:`, e);
      }
      break;
    }
  }
};
```

Usage in blocks:

```js
// In a .lego file
<script>
export default {
  todos: Lego.db('my-todos').default([]),
  theme: Lego.db('theme').default('light'),
  
  addTodo(text) {
    this.todos.push({ text, done: false });
    // Automatically saved to localStorage
    // Automatically synced across tabs
  }
}
</script>
```

## How $db Works

1. **Descriptor Detection**: During `snap()`, the reactive system detects `$db` descriptors
2. **Initialization**: Loads value from localStorage or uses default
3. **Replacement**: Replaces the descriptor with the actual value
4. **Auto-save**: The reactive proxy's `set` trap calls `handleDbUpdate()`
5. **Cross-tab Sync**: The `storage` event listener updates other tabs

## Adding Custom Globals

You can extend globals in your app:

```js
// In your app initialization
Lego.globals.user = { name: 'Guest' };
Lego.globals.notifications = [];

// Later, from any block:
this.$emit('login', { user: someUser });

// Or in event handlers:
<button @click="$globals.user = { name: 'Admin' }">
```

## Reactivity Through Getters

Notice that `$route` and `$go` are defined as **getters** in the base state:

```js
get $route() { return globals.$route }
```

This means:
1. Reading `this.$route` always gets the current value from globals
2. The globals object itself is reactive
3. Changes to `globals.$route` trigger re-renders in blocks that reference it

## Why Proxy for Globals?

LegoDOM uses **Proxy** for globals because it allows for **dynamic property addition**:

-   In older libraries, you had to declare all your global variables upfront.
    
-   Because Lego uses a Proxy (via the `reactive()` function), you can do `Lego.globals.newVar = 'surprise'` at runtime, and LegoDOM will immediately catch that "set" operation and notify all dependent blocks.

## The $go and Globals Synergy

When you use `$go` to navigate (from `src/features/router.js`), it updates `globals.$route`. Any block that references `$route` in its template automatically re-renders:

```html
<!-- Header block - rerenders when route changes -->
<template>
  <nav>
    <span class="breadcrumb">[[ $route.url ]]</span>
  </nav>
</template>
```

This allows for **Persistent Identity**: The user's name stays in the header because the header block is subscribed to `Lego.globals.user`, even as the rest of the page is being torn down and rebuilt by the router.

## Integration with Batcher

Global state changes go through the same batcher as local state:

```js
// When you update a global
Lego.globals.theme = 'dark';

// The reactive proxy detects the change
// It queues ALL blocks that reference $theme
// The batcher combines them into one render frame
```

---

**Summary**: The global state system in `src/core/globals.js` and `src/features/persistence.js` provides a centralized, reactive hub that bypasses the DOM hierarchy. Data is shared via subscription (reactive getters) rather than prop drilling. The `$db` helper adds automatic localStorage persistence with cross-tab synchronization, making state management effortless.
