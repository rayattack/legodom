# Big Brother is Watching

In Topic 6, we saw that `Lego.init()` sets up a "watchdog." Now, let's look at exactly how that watchdog functions. This is what makes LegoDOM feel "automatic"—you can inject HTML into the page using vanilla JavaScript, and Lego will instantly recognize it and bring it to life.

## Mutation Observer

The `MutationObserver` is a built-in browser API that provides the ability to watch for changes being made to the DOM tree. In this library, it acts as the "Event Loop" for block lifecycles.

## Location in the Codebase

The observer setup is in `src/index.js` within the `Lego.init()` method:

```js
// src/index.js
import { snap, unsnap } from './core/lifecycle.js';
import { registry, activeBlocks } from './core/registry.js';
import { config } from './utils/helpers.js';

const Lego = {
  init: async (root = document.body, options = {}) => {
    // ... configuration ...
    
    // Define the check and load function
    const checkAndLoad = (n) => {
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      snap(n);
      
      // Auto-loader for undefined blocks
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

    // Setup the MutationObserver
    const observer = new MutationObserver(m => m.forEach(r => {
      r.addedNodes.forEach(checkAndLoad);
      r.removedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && unsnap(n));
    }));
    
    observer.observe(root, { childList: true, subtree: true });
    
    // ... rest of initialization ...
  }
};
```

## 1. The Configuration

LegoDOM observes the root element (usually `document.body`) with specific settings:

```js
observer.observe(root, { childList: true, subtree: true });
```

-   **`childList: true`**: Tells the observer to watch for elements being added or removed.

-   **`subtree: true`**: This is vital. Without this, LegoDOM would only see things added directly to the root. With it, LegoDOM sees changes happening deep inside nested divs or other blocks.

## 2. Processing `addedNodes`

Whenever a new piece of HTML is injected (via `innerHTML`, `appendChild`, etc.), the observer receives a list of `addedNodes`.

-   **Filter**: LegoDOM checks `n.nodeType === Node.ELEMENT_NODE` to ensure it is an **Element** (like a `<div>` or `<my-comp>`) and not just a fragment of text.

-   **The Action**: It calls `snap(n)` from `src/core/lifecycle.js`. This triggers the entire initialization process: attaching the Shadow DOM, creating reactive state, and rendering the template.
    
-   **Auto-Discovery (v2.0+)**: If `snap(n)` doesn't find a template in the registry, the observer checks `config.loader`. If configured, it fetches the block definition from the server using `defineLegoFile()` from `src/core/parser.js`.

### The Auto-Loader Flow

```js
const tagName = n.tagName.toLowerCase();
if (tagName.includes('-') && !registry[tagName] && config.loader && !activeBlocks.has(n)) {
  const result = config.loader(tagName);
  if (result) {
    // loader can return:
    // 1. A URL string (e.g., '/blocks/user-card.lego')
    // 2. A Promise resolving to the file content
    // 3. The file content directly
    
    const promise = (typeof result === 'string')
      ? fetch(result).then(r => r.text())
      : result;

    Promise.resolve(promise)
      .then(legoFile => Lego.defineLegoFile(legoFile, tagName + '.lego'))
      .catch(e => console.error(`[Lego] Failed to load ${tagName}:`, e));
  }
}
```

This enables patterns like:

```js
Lego.init(document.body, {
  loader: (tagName) => {
    // Load blocks from server on-demand
    return `/api/blocks/${tagName}.lego`;
  }
});
```

## 3. Processing `removedNodes`

When an element is deleted from the page, the observer catches it in `removedNodes`.

-   **Cleanup**: It calls `unsnap(n)` from `src/core/lifecycle.js`.

-   **Lifecycle Hook**: `unsnap` checks the block's state for an `unmounted` function. This allows you to perform cleanup, like stopping timers or closing WebSocket connections, preventing memory leaks.

```js
// src/core/lifecycle.js
export const unsnap = (el) => {
  // 1. Call unmounted lifecycle hook first
  if (el._studs && typeof el._studs.unmounted === 'function') {
    try {
      el._studs.unmounted.call(el._studs);
    } catch (e) {
      handleError(e, el, 'unmounted');
    }
  }

  // 2. Recursively unsnap children
  // 3. Remove from tracking sets
  // 4. Break circular references
  // ... (see 08-snap.md for full details)
};
```

## Why this is superior to manual initialization

In most frameworks, you have to tell the framework when you've changed the page (e.g., calling `root.render()`). LegoDOM turns that upside down by using the browser's native **MutationObserver** to watch the DOM and react automatically.

Unlike some libraries where adding a button via `innerHTML` requires a manual "re-scan" or "re-bind" call, this setup makes LegoDOM **reactive to the DOM itself**: the moment a tag like `<user-card>` appears in the document, it is automatically detected and upgraded into a functional, living block.

## The Strategy: "Observe Once, Act Everywhere"

LegoDOM sets up a single observer on the root element:

-   **`childList: true`**: Watch for the addition or removal of direct children.

-   **`subtree: true`**: This is the "secret sauce." It extends the observation to the entire DOM tree. If you have a deeply nested `div` and you inject a Lego block into it, the observer will see it.

## The Logic Loop: Added Nodes

When the observer detects changes, it provides a list of `MutationRecord` objects. LegoDOM loops through these records specifically looking for `addedNodes`.

-   **Type Filtering**: It checks `n.nodeType === Node.ELEMENT_NODE`. This ensures LegoDOM ignores text changes or comments and only focuses on **Elements** (tags).

-   **The Upgrade (Snapping)**: For every new element found, it calls `snap(n)`. This is why you can do `document.body.innerHTML += '<my-counter></my-counter>'` in the console, and the counter will immediately start working.

## The Logic Loop: Removed Nodes

This is equally important for "garbage collection." When an element is deleted, it appears in `removedNodes`.

-   **The `unsnap` Trigger**: LegoDOM calls `unsnap(n)`.

-   **Lifecycle Cleanup**: Inside `unsnap`, LegoDOM looks for a developer-defined `unmounted` function. This is where you'd kill `setInterval` timers or close database connections. Without this, your app would suffer from "Memory Leaks"—processes that keep running even though the block is gone.

## Integration with Other Modules

The observer ties together multiple parts of the system:

1. **`src/core/lifecycle.js`**: Calls `snap()` and `unsnap()`
2. **`src/core/registry.js`**: Checks if blocks are registered
3. **`src/core/parser.js`**: Uses `defineLegoFile()` for lazy loading
4. **`src/utils/helpers.js`**: Accesses `config.loader` for auto-discovery

---

**Summary**: The MutationObserver is LegoDOM's "nervous system." It automatically detects when blocks are added or removed, triggering the snap/unsnap lifecycle without any manual intervention. This is what makes LegoDOM feel "alive" and reactive to DOM changes.
