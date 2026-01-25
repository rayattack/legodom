# Reacting to stimuli is how we react to stimuli

If living things react to stimuli, then so should our blocks.

## Topic 4: Reactivity (The Proxy)

LegoDOM uses the JavaScript **`Proxy`** object to create its reactivity. Think of a Proxy as a "security guard" that sits in front of your data object. Every time you try to read or change a property, the guard intercepts the request.

## Location in the Codebase

The reactive system lives in `src/core/reactive.js`:

```js
// src/core/reactive.js
import { isDbDescriptor, initializeDbProp, handleDbUpdate } from '../features/persistence.js';

const proxyCache = new WeakMap();

export const reactive = (obj, el, batcher = null) => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Node) return obj;
  if (proxyCache.has(obj)) return proxyCache.get(obj);

  // Initialize $db descriptors before proxying
  for (const k in obj) {
    if (isDbDescriptor(obj[k])) {
      initializeDbProp(obj, k, obj[k], el, batcher);
    }
  }

  const handler = {
    get: (t, k) => {
      const val = Reflect.get(t, k);
      if (val !== null && typeof val === 'object' && !(val instanceof Node)) {
        return reactive(val, el, batcher);
      }
      return val;
    },
    set: (t, k, v) => {
      const old = t[k];
      const r = Reflect.set(t, k, v);
      
      if (old !== v) {
        // Notify persistence system if this is a $db property
        handleDbUpdate(t, k, v);
        
        // Queue render if batcher is available
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

## The Proxy Traps

1.  **The `get` trap**: 
    
    -   When you access a property (e.g., `state.count`), the Proxy checks if that property is _also_ an object.
    -   If it is, it recursively wraps that object in a Proxy too.
    -   This ensures that "deep" data like `user.profile.name` is also reactive.
        
2.  **The `set` trap**: 
    
    -   This is the main trigger. When you do `state.count = 5`, the Proxy compares the `old` value with the `new` value.
    -   If they are different, it:

        a. Calls `handleDbUpdate()` to sync with `localStorage` if this is a `$db` property

        b. Calls `batcher.add(el)` to queue a render

3.  **The `deleteProperty` trap**: 
    
    -   Even if you delete a key (e.g., `delete state.tempData`), the Proxy intercepts this and tells the batcher to re-render the UI.
        

## Handling Special Cases

### Objects vs. Nodes

The code explicitly checks `instanceof Node`. If you try to store a raw HTML element in your state, LegoDOM **will not** wrap it in a Proxy. This prevents LegoDOM from accidentally trying to "observe" the entire DOM tree, which would crash the browser.

### Database Integration

The reactive system integrates with the persistence layer (`src/features/persistence.js`):

```js
// Check for $db descriptors
if (isDbDescriptor(obj[k])) {
  initializeDbProp(obj, k, obj[k], el, batcher);
}
```

This allows you to write:

```js
{
  todos: $db('my-todos').default([])
}
```

And have the data automatically persist to `localStorage` and sync across tabs.

## Usage in the Framework

The `reactive()` function is called from `src/core/lifecycle.js` during the `snap()` process:

```js
// src/core/lifecycle.js
import { reactive } from './reactive.js';
import { globalBatcher } from './batcher.js';

el._studs = reactive(baseState, el);
```

## Concrete Example

Imagine you have a block defined like this:

```js
Lego.block('counter-app', '<h1>[[ count ]]</h1>', {
  count: 0,
  increment() { this.count++; }
});
```

**The Flow**:

-   **Step A**: Lego takes that object `{ count: 0, ... }` and wraps it in a Proxy via `reactive()`.
    
-   **Step B**: You call `increment()`.
    
-   **Step C**: The line `this.count++` triggers the Proxy's `set` trap.
    
-   **Step D**: The `set` trap notices `0` is now `1` and calls `globalBatcher.add(thisElement)`.
    
-   **Step E**: The Batcher (from `src/core/batcher.js`) schedules a render for the next animation frame.
    

## Why this is "Surgical"

Because the `reactive` function is passed the specific element (`el`) it belongs to, it knows exactly which block in the DOM needs to re-render. It doesn't have to guess or refresh the whole page; it targets the specific "Lego block" that owns that data.

This is fundamentally different from Virtual DOM approaches where the entire component tree must be diffed.
