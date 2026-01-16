# Reacting to stimuli is how we react to stimuli

If living things react to stimuli, then so should our components.


## Topic 4: Reactivity (The Proxy)

LegoDOM uses the JavaScript **`Proxy`** object to create its reactivity. Think of a Proxy as a "security guard" that sits in front of your data object. Every time you try to read or change a property, the guard intercepts the request.

### The `reactive(obj, el, batcher)` Function

When a component is "snapped" (created), its data is passed through this function.

```js
  //... rest of the code
  const reactive = (obj, el, batcher = globalBatcher) => {
    if (obj === null || typeof obj !== 'object' || obj instanceof Node) return obj;
    if (proxyCache.has(obj)) return proxyCache.get(obj);

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
        if (old !== v) batcher.add(el);
        return r;
      },
      deleteProperty: (t, k) => {
        const r = Reflect.deleteProperty(t, k);
        batcher.add(el);
        return r;
      }
    };

    const p = new Proxy(obj, handler);
    proxyCache.set(obj, p);
    return p;
  };

  //... rest of the code
```

1.  **The Traps (`get` and `set`)**:
    
    -   **The `get` trap**: When you access a property (e.g., `state.count`), the Proxy checks if that property is _also_ an object. If it is, it recursively wraps that object in a Proxy too. This ensures that "deep" data like `user.profile.name` is also reactive.
        
    -   **The `set` trap**: This is the trigger. When you do `state.count = 5`, the Proxy compares the `old` value with the `new` value. If they are different, it immediately calls `batcher.add(el)`.
        
    -   **The `deleteProperty` trap**: Even if you delete a key (e.g., `delete state.tempData`), the Proxy intercepts this and tells the batcher to re-render the UI.
        
2.  **Handling Objects vs. Nodes**:
    
    -   The code explicitly checks if a value is an `instanceof Node`. If you try to store a raw HTML element in your state, LegoDOM **will not** wrap it in a Proxy. This prevents LegoDOM from accidentally trying to "observe" the entire DOM tree, which would crash the browser.
        

### Concrete Example

Imagine you have a component defined like this:

```js
Lego.define('counter-app', '<h1>{{count}}</h1>', {
  count: 0,
  increment() { this.count++; }
});

```

-   **Step A**: Lego takes that object `{ count: 0, ... }` and wraps it in a Proxy.
    
-   **Step B**: You call `increment()`.
    
-   **Step C**: The line `this.count++` triggers the Proxy's `set` trap.
    
-   **Step D**: The `set` trap notices `0` is now `1` and calls `globalBatcher.add(thisElement)`.
    
-   **Step E**: The Batcher (from Topic 3) schedules a render for the next animation frame.
    

### Why this is "Surgical"

Because the `reactive` function is passed the specific element (`el`) it belongs to, it knows exactly which component in the DOM needs to re-render. It doesn't have to guess or refresh the whole page; it targets the specific "Lego block" that owns that data.
