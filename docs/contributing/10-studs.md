# State Management: The `_studs` Brain

Let's see how the "Cake" of data we merged in Topic 9 is actually brought to life. This is the moment a static object becomes a **Reactive State**, which LegoDOM stores in a property called `_studs`.

## The `_studs` Property

Once `snap()` has merged the data from the Script (Tier 1), the Template (Tier 2), and the Instance (Tier 3), it doesn't just save that object to the element. It transforms it into a reactive proxy.

## Location in the Codebase

This transformation happens in `src/core/lifecycle.js`:

```js
// src/core/lifecycle.js
import { reactive } from './reactive.js';
import { mergeDescriptors } from '../utils/helpers.js';
import { globals } from './globals.js';
import { findAncestor } from '../utils/dom.js';

export const snap = (el) => {
  // ... template and shadow setup ...

  // TIER 1: Script logic from Lego.block or .lego file
  const scriptLogic = legoFileLogic.get(name) || {};

  // TIER 2: Template-level logic
  const templateLogic = parseJSObject(
    templateNode.getAttribute('b-logic') || 
    templateNode.getAttribute('b-logic') || '{}'
  );

  // TIER 3: Instance-level logic (scoped to parent)
  const parentBlock = findAncestor(el, '*') || findAncestor(el.getRootNode().host, '*');
  const parentScope = parentBlock?.state || {};
  const instanceLogic = parseJSObject(
    el.getAttribute('b-logic') || 
    el.getAttribute('b-logic') || '{}',
    parentScope
  );

  // Build base state with framework helpers
  const baseState = {
    $vars: {},
    $element: el,
    get $parent() { return findAncestor(el, '*') },
    $emit: (name, detail) => {
      el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    },
    get $route() { return globals.$route },
    get $go() { return globals.$go }
  };

  // Merge all tiers
  mergeDescriptors(scriptLogic, baseState);
  mergeDescriptors(templateLogic, baseState);
  mergeDescriptors(instanceLogic, baseState);

  // Transform into reactive proxy
  el._studs = reactive(baseState, el);

  // Convenience getter/setter
  Object.defineProperty(el, 'state', {
    get() { return this._studs },
    set(v) { Object.assign(this._studs, v) },
    configurable: true,
    enumerable: false
  });

  // ... rest of snap logic ...
};
```

## 1. Why the name `_studs`?

In the physical world, "studs" are the bumps on top of a Lego brick that allow it to connect to others. In this library:

-   **`el._studs`** represents the connection point between your JavaScript logic and the DOM.
    
-   It is the "source of truth" for the block. Every `[[ variable ]]` you write in your HTML is looking for a matching key inside `_studs`.
    
-   The underscore prefix `_` indicates it's an internal property (though still publicly accessible for debugging).

## 2. The Transformation: `reactive()`

LegoDOM executes this line during the snap process:

```js
el._studs = reactive(baseState, el);
```

The `reactive()` function is defined in `src/core/reactive.js`:

```js
// src/core/reactive.js
import { globalBatcher } from './batcher.js';
import { isDbDescriptor, initializeDbProp, handleDbUpdate } from '../features/persistence.js';

const proxyCache = new WeakMap();

export const reactive = (obj, el, batcher = globalBatcher) => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Node) return obj;
  if (proxyCache.has(obj)) return proxyCache.get(obj);

  // Initialize $db descriptors
  for (const k in obj) {
    if (isDbDescriptor(obj[k])) {
      initializeDbProp(obj, k, obj[k], el, batcher);
    }
  }

  const handler = {
    get: (t, k) => {
      const val = Reflect.get(t, k);
      // Recursively make nested objects reactive
      if (val !== null && typeof val === 'object' && !(val instanceof Node)) {
        return reactive(val, el, batcher);
      }
      return val;
    },
    set: (t, k, v) => {
      const old = t[k];
      const r = Reflect.set(t, k, v);
      
      if (old !== v) {
        // Notify persistence layer if needed
        handleDbUpdate(t, k, v);
        
        // Queue render
        if (batcher) batcher.add(el);
      }
      return r;
    },
    deleteProperty: (t, k) => {
      const r = Reflect.deleteProperty(t, k);
      if (batcher) batcher.add(el);
      return r;
    }
  };

  const p = new Proxy(obj, handler);
  proxyCache.set(obj, p);
  return p;
};
```

-   **The Proxy wrapping**: This wraps the merged object in a **Proxy** (see Topic 4 for details).
    
-   **The `el` argument**: Crucially, the proxy is given a reference to the DOM element (`el`). This allows the Proxy's `set` trap to know exactly which block needs to be added to the `globalBatcher` when a property changes.
    

## 3. Contextual Binding (The `this` Keyword)

After the `_studs` proxy is created, LegoDOM ensures that your methods work correctly. When you define a method in your Lego File, you expect `this` to point to your data.

-   Inside `snap()`, lifecycle hooks are called like this:
    
    ```js
    if (typeof el._studs.mounted === 'function') {
      try {
        el._studs.mounted.call(el._studs);
      } catch (e) {
        handleError(e, el, 'mounted');
      }
    }
    ```
    
-   By using `.call(el._studs)`, LegoDOM forces the execution context of your functions to be the reactive proxy.
    
-   **Result**: When you write `this.count++` in your code, you are actually interacting with the **Proxy**, which triggers the `set` trap, which notifies the **Batcher**, which triggers the **Render**.

## 4. The `state` Convenience Property

For easier access, LegoDOM also defines a `state` property on the element:

```js
Object.defineProperty(el, 'state', {
  get() { return this._studs },
  set(v) { Object.assign(this._studs, v) },
  configurable: true,
  enumerable: false
});
```

This allows you to use either `el._studs` or `el.state` interchangeably:

```js
const myBlock = document.querySelector('my-block');
myBlock.state.count++;  // Same as myBlock._studs.count++
```

## 5. Injected Framework Helpers

The base state includes several framework-provided helpers:

```js
const baseState = {
  $vars: {},              // DOM element references (populated by b-var)
  $element: el,           // The block's root element
  get $parent() { ... },  // Lazy parent block lookup
  $emit: (name, detail) => { ... },  // Event emitter
  get $route() { ... },   // Current route (from src/features/router.js)
  get $go() { ... }       // Navigation helper (from src/features/router.js)
};
```

These are available in all blocks automatically:

```js
// In your block logic:
{
  mounted() {
    console.log(this.$element);  // The <my-block> DOM element
    console.log(this.$parent);   // The parent block (if nested)
    this.$emit('loaded', { time: Date.now() });
    this.$go('/dashboard');      // Navigate to route
  }
}
```

## 6. Database Integration

If you use `$db` properties, they are automatically initialized:

```js
// In your block:
{
  todos: Lego.db('my-todos').default([])
}

// During snap(), reactive() detects the descriptor and converts it:
// 1. Loads existing value from localStorage
// 2. Replaces descriptor with actual value
// 3. Registers for auto-save on changes
// 4. Registers for cross-tab sync
```

This is handled by `src/features/persistence.js`.

## 7. Visibility vs. Privacy

-   **`_studs`**: This is attached directly to the DOM element. You can actually type `document.querySelector('my-block')._studs` in your browser console to see and even modify the live state of any block. This is great for debugging.
    
-   **`privateData`**: Unlike `_studs`, the internal "housekeeping" (like whether the block has already snapped, bindings cache, etc.) is kept in a `WeakMap` called `privateData` (in `src/core/registry.js`), making it inaccessible to the outside world.

```js
// src/core/registry.js
export const privateData = new WeakMap();

export const getPrivateData = (el) => {
  if (!privateData.has(el)) {
    privateData.set(el, {
      snapped: false,
      bindings: null,
      rendering: false,
      anchor: null,
      bound: false
    });
  }
  return privateData.get(el);
};
```

---

**Summary**: `_studs` is the reactive engine of your block. It is created by merging all data tiers (Script, Template, Instance) with framework helpers, then wrapping the result in a Proxy from `src/core/reactive.js`. This proxy is uniquely linked to that specific DOM element, enabling surgical, per-block reactivity.
