# Topic 1: The Module Pattern & Private Scope

LegoDOM is wrapped in an **IIFE** (Immediately Invoked Function Expression) assigned to `const Lego`. This creates a closure, meaning any variable declared at the top (like `registry` or `proxyCache`) is "private"—it cannot be accessed or tampered with from the browser console unless explicitly exposed.

```js
const Lego = (() => {
  // ... all the logic ...
  return {
    init: () => { ... },
    define: (tagName, templateHTML, logic = {}) => { ... },
    // ...
  };
})();

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', Lego.init);
  window.Lego = Lego;
}
```

### Why Not Modular ES6?

I started with an **IIFE** and underestimated how big it could grow. It might be a better idea to use ES6 modules, but I'm too lazy to refactor it at the moment.

### The use of `WeakMap`

You’ll notice the use of `WeakMap` for `proxyCache`, `privateData`, and `forPools`.

-   **Why not a regular Map?** A `WeakMap` allows the keys (which are DOM elements in this code) to be **garbage collected** if the element is removed from the DOM.
    
-   **Memory Leak Prevention:** If we used a regular `Map`, the library would hold a reference to every component ever created, even if you deleted them, eventually crashing the browser tab.
    

### Internal Registry

`const registry = {}` acts as the library's "brain." It stores the `<template>` elements that define what a component looks like. When you write `<my-button>`, Lego looks into this object to find the blueprint.
