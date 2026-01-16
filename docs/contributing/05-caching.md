# There are 2 hard things in computer science

- cache invalidation
- naming things
- off-by-one errors


## Proxy Caching (`proxyCache`)

In [Topic 4](/contributing/04-reactivity), we saw how `reactive()` wraps objects in a Proxy.
However, a common issue in reactive programming is trying to wrap the same object multiple
times, or dealing with circular references
(e.g. Object A points to Object B, and Object B points back to Object A).

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

LegoDOM uses `const proxyCache = new WeakMap()` to keep track of every object it has already turned into a Proxy.

1.  **Checking the Map**: At the very start of the `reactive()` function, the code checks: `if (proxyCache.has(obj)) return proxyCache.get(obj);`.
    
2.  **Storing the Result**: If it's a new object, the code creates the Proxy and then immediately saves it: `proxyCache.set(obj, p);`.
    
3.  **The Result**: If you access `state.user` 100 times, you get the exact same Proxy instance every time. It ensures that `p1 === p2` is always `true`.
    

### Why a `WeakMap`?

This is a critical "expert-level" choice.

-   A regular `Map` holds a "strong reference" to its keys. If you deleted a piece of data from your state, but that data was still a key in a regular `Map`, the browser could never delete it from memory.
    
-   Because `proxyCache` is a `WeakMap`, as soon as your component is destroyed and the original object is no longer needed, the browser’s Garbage Collector can automatically wipe it from the cache.
    

### Summary of Logic:

-   **Step 1:** Request to make `obj` reactive.
    
-   **Step 2:** Check `proxyCache`. Found it? Return the existing Proxy.
    
-   **Step 3:** Not found? Create a new Proxy.
    
-   **Step 4:** Store `obj -> Proxy` in `proxyCache`.
    
-   **Step 5:** Return the new Proxy.
