# There are 2 hard things in computer science

- cache invalidation
- naming things
- off-by-one errors

## Topic 5: Caching Strategies

LegoDOM uses two distinct caching strategies to optimize performance: **Proxy Caching** and **Expression Caching**.

## 1. Proxy Caching (`proxyCache`)

Located in `src/core/reactive.js`, the proxy cache prevents infinite recursion and ensures object identity.

### The Problem: Infinite Recursion

Without a cache, every time you access a nested object, the `get` trap would create a **new** Proxy wrapper.

```js
// Without a cache:
const p1 = state.user; 
const p2 = state.user;
console.log(p1 === p2); // false! They are different "guards" for the same data.
```

This wastes memory and breaks object identity. Even worse, if an object points to itself, the code would keep creating Proxies until the browser crashed with a "Maximum call stack size exceeded" error.

### The Solution: `proxyCache`

```js
// src/core/reactive.js
const proxyCache = new WeakMap();

export const reactive = (obj, el, batcher = null) => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Node) return obj;
  
  // Check cache first
  if (proxyCache.has(obj)) return proxyCache.get(obj);

  // ... create proxy ...
  const p = new Proxy(obj, handler);
  
  // Store in cache
  proxyCache.set(obj, p);
  return p;
};
```

1.  **Checking the Map**: At the very start of the `reactive()` function, the code checks: `if (proxyCache.has(obj)) return proxyCache.get(obj);`.
    
2.  **Storing the Result**: If it's a new object, the code creates the Proxy and then immediately saves it: `proxyCache.set(obj, p);`.
    
3.  **The Result**: If you access `state.user` 100 times, you get the exact same Proxy instance every time. It ensures that `p1 === p2` is always `true`.
    

### Why a `WeakMap`?

This is a critical "expert-level" choice.

-   A regular `Map` holds a "strong reference" to its keys. If you deleted a piece of data from your state, but that data was still a key in a regular `Map`, the browser could never delete it from memory.
    
-   Because `proxyCache` is a `WeakMap`, as soon as your block is destroyed and the original object is no longer needed, the browser's Garbage Collector can automatically wipe it from the cache.
    

## 2. Expression Caching (LRU Cache)

Located in `src/utils/safe-eval.js`, the expression cache prevents recompiling the same template expressions repeatedly.

### The Problem: Repeated Compilation

Every time you render `[[ user.name + ' ' + user.lastName ]]`, LegoDOM needs to evaluate that JavaScript expression. Without caching, it would parse and compile it fresh every single render, wasting CPU cycles.

### The Solution: LRU Cache

```js
// src/utils/safe-eval.js
import { LRUCache } from './lru-cache.js';

const exprCache = new LRUCache(500);

export const safeEval = (expr, scope = {}, allowSideEffects = false) => {
  if (typeof expr !== 'string') return expr;
  
  const cacheKey = expr.trim();
  
  // Check cache
  let fn = exprCache.get(cacheKey);
  
  if (!fn) {
    // Compile expression
    const keys = Object.keys(scope);
    const values = keys.map(k => scope[k]);
    
    try {
      if (allowSideEffects) {
        fn = new Function(...keys, expr);
      } else {
        fn = new Function(...keys, `return (${expr})`);
      }
      
      // Store in cache
      exprCache.set(cacheKey, fn);
    } catch (e) {
      console.error(`[Lego] Expression error: ${expr}`, e);
      return '';
    }
  }
  
  // Execute with current scope values
  const keys = Object.keys(scope);
  const values = keys.map(k => scope[k]);
  
  try {
    return fn(...values);
  } catch (e) {
    console.error(`[Lego] Eval error: ${expr}`, e);
    return '';
  }
};
```

### LRU (Least Recently Used) Eviction

The cache is implemented in `src/utils/lru-cache.js`:

```js
export class LRUCache {
  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // Remove if exists (to update order)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Add to end
    this.cache.set(key, value);
    
    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}
```

When the cache reaches 500 entries, it evicts the **least recently used** expression to make room for new ones. This prevents unbounded memory growth while keeping "hot" expressions readily available.

### Why 500?

Through testing, 500 compiled expressions provide a good balance:
- Large enough for complex apps with many unique expressions
- Small enough to avoid memory issues
- LRU ensures frequently-used expressions stay cached

## Summary of Caching Logic

**Proxy Cache**:
-   **Step 1:** Request to make `obj` reactive.
-   **Step 2:** Check `proxyCache`. Found it? Return the existing Proxy.
-   **Step 3:** Not found? Create a new Proxy.
-   **Step 4:** Store `obj -> Proxy` in `proxyCache`.
-   **Step 5:** Return the new Proxy.

**Expression Cache**:
-   **Step 1:** Expression needs evaluation (e.g., `[[ count * 2 ]]`).
-   **Step 2:** Check `exprCache` with expression as key.
-   **Step 3:** Found it? Use cached function.
-   **Step 4:** Not found? Compile with `new Function()` and cache it.
-   **Step 5:** Execute function with current scope values.
-   **Step 6:** If cache is full, evict least recently used entry.

Both caches are essential for LegoDOM's performance, preventing repeated work while managing memory efficiently.
