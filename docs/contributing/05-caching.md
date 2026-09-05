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

Every `[[ user.first + ' ' + user.last ]]`, every `b-if`, every `@click` body is
an expression that has to be turned into something runnable. `src/utils/expression.js`
does that once per distinct source string and caches the result in an
`LRUCache(1000)` from `src/utils/lru-cache.js`.

### What gets cached

Not a string, and not a `Function`. The compiler tokenizes the source, parses it
into an AST with a precedence-climbing parser, and walks that AST once to build a
tree of small closures. The cache holds the root closure:

```js
// src/utils/expression.js
const cache = new LRUCache(1000);

export const compile = (src) => {
  let fn = cache.get(src);
  if (fn) return fn;
  fn = gen(parse(src));      // tokenize -> parse -> closures
  cache.set(src, fn);
  return fn;
};
```

Every later render of the same expression is a `Map` lookup plus a call to
`fn(scope, ctx)`. Nothing is re-tokenized, re-parsed, or re-compiled.

### Why an LRU and not a plain Map

A template can generate unbounded distinct expressions (an attribute built from
data, a thousand list rows with a thousand different `b-data` bodies). A plain
`Map` would grow forever. The LRU keeps the thousand most recently used and
evicts the rest; an evicted expression simply pays the parse cost again the next
time it appears.

`src/utils/safe-eval.js` keeps one more, much smaller cache: a plain `Map` for
the `b-logic` bodies the expression grammar cannot represent (methods with
statement bodies), which fall back to `Function()`. That set is fixed per
application, so it needs no eviction policy.

## Summary of Caching Logic

**Proxy Cache**:
-   **Step 1:** Request to make `obj` reactive.
-   **Step 2:** Check `proxyCache`. Found it? Return the existing Proxy.
-   **Step 3:** Not found? Create a new Proxy.
-   **Step 4:** Store `obj -> Proxy` in `proxyCache`.
-   **Step 5:** Return the new Proxy.

**Expression Cache**:
-   **Step 1:** Expression needs evaluation (e.g., `[[ count * 2 ]]`).
-   **Step 2:** Check the compile cache with the source string as key.
-   **Step 3:** Found it? Call the cached closure with `(scope, ctx)`.
-   **Step 4:** Not found? Tokenize, parse to an AST, compile to closures, cache.
-   **Step 5:** Call the closure. Identifier reads go through the state proxy,
    so the renderer's dependency tracking still sees every read.
-   **Step 6:** If cache is full, evict least recently used entry.

Both caches are essential for LegoDOM's performance, preventing repeated work while managing memory efficiently.
