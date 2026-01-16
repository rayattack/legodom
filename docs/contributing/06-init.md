# In the beginning - `Lego.init()`

The `init()` function is the heart of LegoDOM. It orchestrates the entire initialization process, setting up the observer, connecting the global state, and processing existing components.

## The LegoDOM Entry Point

When your HTML finishes loading

```js
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', Lego.init);
  window.Lego = Lego;
}
```


LegoDOM executes `Lego.init()`. This is the orchestration phase where the library sets up its "eyes" (the observer) and connects the global state to the page.

```js
  return {
    init: () => {
      document.querySelectorAll('template[b-id]').forEach(t => {
        registry[t.getAttribute('b-id')] = t;
      });
      const observer = new MutationObserver(m => m.forEach(r => {
        r.addedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && snap(n));
        r.removedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && unsnap(n));
      }));
      observer.observe(document.body, { childList: true, subtree: true });

      snap(document.body);
      bind(document.body, { _studs: Lego.globals, _data: { bound: false } });

      if (routes.length > 0) {
        // Smart History: Restore surgical targets on Back button
        window.addEventListener('popstate', (event) => {
          const targets = event.state?.legoTargets || null;
          _matchRoute(targets);
        });

        document.addEventListener('click', e => {
          const link = e.target.closest('a[b-link]');
          if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            const targetAttr = link.getAttribute('b-target');
            const targets = targetAttr ? targetAttr.split(' ') : [];

            // Execute navigation via $go logic
            Lego.globals.$go(href, ...targets);
          }
        });
        _matchRoute();
      }
    },
    // ... other functions ...
  };

```

### 1. Template Registration

The first thing `init()` does is look for blueprints you've already defined in your HTML.

```js
document.querySelectorAll('template[b-id]').forEach(t => {
  registry[t.getAttribute('b-id')] = t;
});

```

It scans the entire document for any `<template>` tag that has a `b-id` attribute. It then adds these to the `registry` object we discussed in [Topic 2](/contributing/02-registry). This allows you to define components directly in your HTML file without writing a single line of JavaScript.

### 2. Setting up the "Eyes" (`MutationObserver`)

This is the most critical part of the initialization. LegoDOM creates a `MutationObserver`.

```js
const observer = new MutationObserver(m => m.forEach(r => {
  r.addedNodes.forEach(n => {
    if (n.nodeType === Node.ELEMENT_NODE) {
      snap(n);
      
      // Auto-Discovery (v2.0): Check for remote components
      const tagName = n.tagName.toLowerCase();
      if (tagName.includes('-') && !registry[tagName] && config.loader && !activeComponents.has(n)) {
        // ... Call loader ...
      }
    }
  });
  r.removedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && unsnap(n));
}));
observer.observe(document.body, { childList: true, subtree: true });
```

- **What it does**: It watches the `document.body` for any changes to the HTML structure.
- **Auto-Discovery (New in v2.0)**: If `snap(n)` fails because the component isn't in the registry, the observer now checks `config.loader`. If a loader is defined, it triggers a fetch to pull the component definition from the server. This enables the "HTMX+Components" pattern.
    
-   **The Config**: It observes `{ childList: true, subtree: true }`. This means it sees if an element is added to the body, or if an element is added deep inside another element.
    
-   **The Reaction**:
    
    -   If a new node is **added**, it calls `snap(n)` (which we will cover soon) to turn that raw HTML into a living component.
        
    -   If a node is **removed**, it calls `unsnap(n)` to clean up memory and fire lifecycle hooks.
        

### 3. The "First Snap"

After setting up the observer, it calls `snap(document.body)`.

-   **Why?** The observer only sees _new_ things being added. It doesn't see what was already there when the page loaded.
    
-   By calling `snap` on the body, LegoDOM manually processes every custom component that was present in the initial HTML.
    

### 4. Global Data Binding

Finally, it binds the `Lego.globals` state to the `document.body`.

JavaScript

```
bind(document.body, { _studs: Lego.globals, _data: { bound: false } });

```

This is a clever move: it treats the entire website body as if it were a giant component. This allows you to use reactive data in your "Light DOM" (the regular HTML outside of components) by referencing values stored in `Lego.globals`.

### 5. Routing Initialization

If you have defined any routes using `Lego.route()`, the `init` function sets up global click listeners and history management so that links with the `b-link` attribute don't refresh the page but instead perform a "surgical" swap of content.

----------

**Summary of `init()`:** It finds templates, starts a "watchdog" for new elements, processes existing elements, and enables global data.
