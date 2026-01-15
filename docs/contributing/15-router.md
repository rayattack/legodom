# Where do you want to go?

The true power of the Lego router isn't just changing the URL; it's the **targeted DOM injection** that allows you to swap _any_ part of the page with _any_ component, without writing a single line of `fetch` or `innerHTML` logic.

## The "Surgical" Philosophy

Most SPAs use a **Replacer Strategy**:
`URL Change -> Match Route -> Destroy App -> Rebuild App with new Page.`

LegoDOM uses a **Surgical Strategy**:
`URL Change -> Match Route -> Find Targets (#sidebar, #main) -> Modify ONLY those nodes.`

### The Implementation

The core function is `_go` (exposed as `$go`). It doesn't just look for a `<router-outlet>`. It accepts a list of targets.

```javascript
/* main.js (simplified) */
const _go = (path, ...targets) => {
  // 1. Update History API
  history.pushState({ legoTargets: targets }, "", path);
  
  // 2. Find the component for this route
  const route = routes.find(r => r.path === path);
  const template = registry[route.tagName];

  // 3. Surgical Swap
  targets.forEach(selector => {
    const el = document.querySelector(selector);
    // CRITICAL: We don't touch the parent, we only replace children.
    // This preserves the element's own state (scroll, attributes).
    el.replaceChildren(template.cloneNode(true));
    
    // 4. Trigger Snap (Reactivity & Lifecycle) on new content
    snap(el); 
  });
};
```

### Why this matters

This architecture enables **Persistent Shells**. You can have a sidebar that plays music or holds chat state, while the main content navigates freely. Traditional routers usually require complex "Layout Components" to achieve this. LegoDOM does it by simply *not touching the sidebar*.

## Intelligent Defaults

While surgical routing is powerful, sometimes you just want standard navigation.
LegoDOM checks for a default `<lego-router>` element if no targets are specified.

```javascript
/* main.js */
const resolveTargets = (query) => {
  if (!query) return [document.querySelector('lego-router')];
  // ...
};
```

This hybrid approach gives you the best of both worlds: Rapid prototyping (defaults) and App-like fidelity (surgical targets).
