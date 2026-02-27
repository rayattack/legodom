# Let there be, and it was!

If LegoDOM were a robot it would probably say - `snap()` is the most complex function I have because it acts as the "Middleman" between the static DOM, the reactive state, and the Shadow DOM. It is the "constructor" that the ~~stingy~~ browser never gave anyone - LegoDOM.

## Snap, snap, snap!

The `snap(el)` function lives in `src/core/lifecycle.js` and is responsible for "upgrading" a standard HTML element into a living, breathing Lego block. It is recursive, meaning if you snap a `<div>`, it will automatically look inside that `<div>` and snap every child as well.

```js
// src/core/lifecycle.js
import { registry, legoFileLogic, sharedStates, activeBlocks, getPrivateData } from './registry.js';
import { globals } from './globals.js';
import { config, mergeDescriptors } from '../utils/helpers.js';
import { findAncestor } from '../utils/dom.js';
import { parseJSObject } from '../utils/safe-eval.js';
import { reactive } from './reactive.js';
import { bind, render } from './renderer.js';
import { applyStyles } from './stylesheets.js';
import { handleError } from '../features/error.js';

export const snap = (el) => {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  const data = getPrivateData(el);
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];

  if (templateNode && !data.snapped) {
    data.snapped = true;
    const tpl = templateNode.content.cloneNode(true);
    const shadow = el.attachShadow({ mode: 'open' });

    // Apply scoped stylesheets
    applyStyles(el);

    // TIER 1: Logic from Lego.block (Lego File)
    const scriptLogic = legoFileLogic.get(name) || {};

    // TIER 2: Logic from the <template b-logic="..."> attribute
    const templateLogic = parseJSObject(templateNode.getAttribute('b-logic') || 
                                        templateNode.getAttribute('b-logic') || '{}');

    // TIER 3: Logic from the <my-comp b-logic="..."> tag
    // Scoped to parent's state for prop access
    const parentBlock = findAncestor(el, '*') || findAncestor(el.getRootNode().host, '*');
    const parentScope = parentBlock?.state || {};
    const instanceLogic = parseJSObject(el.getAttribute('b-logic') || 
                                       el.getAttribute('b-logic') || '{}', parentScope);

    // Build base state with helpers
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

    // Create reactive proxy
    el._studs = reactive(baseState, el);

    // Convenience getter/setter
    Object.defineProperty(el, 'state', {
      get() { return this._studs },
      set(v) { Object.assign(this._studs, v) },
      configurable: true,
      enumerable: false
    });

    shadow.appendChild(tpl);

    // Transform 'self' to ':host' in styles
    const style = shadow.querySelector('style');
    if (style) {
      style.textContent = style.textContent.replace(/\bself\b/g, ':host');
    }

    // Bind event listeners and directives
    bind(shadow, el);
    
    // Track active block
    activeBlocks.add(el);
    
    // Initial render
    render(el);

    // Initialize nested components
    const nestedComponents = shadow.querySelectorAll('*');
    nestedComponents.forEach(child => {
      const childTag = child.tagName.toLowerCase();
      if (registry[childTag]) snap(child);
    });

    // Store shadow reference
    if (!el._legoShadow) el._legoShadow = shadow;

    // Call mounted lifecycle hook
    if (typeof el._studs.mounted === 'function') {
      try {
        el._studs.mounted.call(el._studs);
      } catch (e) {
        handleError(e, el, 'mounted');
      }
    }
  }

  // Bind to parent provider
  let provider = el.parentElement;
  while (provider && !provider._studs) provider = provider.parentElement;
  if (provider && provider._studs) bind(el, provider);

  // Recursively snap children
  [...el.children].forEach(snap);
};
```

## The Snap Process

### 1. The Blueprint Lookup

When `snap(el)` runs, the first thing it does is determine if the element is a Lego block:

-   It converts the tag name to lowercase (e.g., `<MY-COMP>` becomes `my-comp`)
-   It checks the **`registry`** (from `src/core/registry.js`) to see if a `<template>` exists for that name
-   It uses `getPrivateData(el).snapped` to ensure it never "snaps" the same element twice, preventing infinite loops

### 2. Attaching the Shadow DOM

If a template is found, Lego creates a **Shadow DOM** for the element:

```js
const shadow = el.attachShadow({ mode: 'open' });
```

-   **Encapsulation**: By using `attachShadow`, the block's internal styles and HTML are shielded from the rest of the page
-   **Template Injection**: It clones the content of the template and appends it to this new Shadow Root

#### What about `<slot>`?

Because we use native Shadow DOM, `<slot>` just works. When `snap` attaches the shadow root, any children *already* inside the custom element (the "Light DOM") are automatically projected into the `<slot>` tags defined in your template. We don't need to write any code for this—the browser does it for us.

### 3. Stylesheet Application

The `applyStyles(el)` function (from `src/core/stylesheets.js`) handles scoped CSS:

```js
// src/core/stylesheets.js
export const applyStyles = (el) => {
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];
  const meta = getPrivateData(el);
  
  if (!meta.stylesheets) {
    meta.stylesheets = { explicit: [], inherited: [], applied: [] };
  }
  
  const stylesAttr = templateNode.getAttribute('b-stylesheets') || '';
  const splitStyles = stylesAttr.split(/\s+/).filter(Boolean);
  
  if (splitStyles.length && el.shadowRoot) {
    const sheets = splitStyles.flatMap(k => styleRegistry.get(k) || []);
    el.shadowRoot.adoptedStyleSheets = sheets;
    meta.stylesheets.applied = [...sheets];
  }
};
```

### 4. CSS "self" Transformation

Lego includes a small but clever utility for styling:

```js
style.textContent = style.textContent.replace(/\bself\b/g, ':host');
```

-   This allows you to write `self { color: red; }` in your template CSS
-   During the snap process, Lego converts the word `self` to the official Web Component selector `:host`, which targets the block itself

### 5. Data Merging & Reactivity (The Three-Tier System)

This is where the block's state is born. LegoDOM merges data from three different sources:

**TIER 1: Script Logic** (highest priority, defined via `Lego.block()` or `.lego` file `<script>`)
**TIER 2: Template Logic** (defined via `<template b-logic="...">`)
**TIER 3: Instance Logic** (lowest priority, defined via `<my-comp b-logic="...">`)

All three are merged into a base state that includes global helpers (`$route`, `$go`, `$parent`, `$emit`), then wrapped in the **`reactive()`** proxy from `src/core/reactive.js`.

The resulting proxy is stored in `el._studs`. This is the "brain" of your block.

### 6. The First Render and Lifecycle

Once the data is ready and the Shadow DOM is attached:

1.  **`bind(shadow, el)`** (from `src/core/renderer.js`): Connects event listeners (like `@click`) inside the Shadow DOM
    
2.  **`render(el)`** (from `src/core/renderer.js`): Performs the initial pass to fill in `[[ variables ]]` and handle `b-show/b-for` logic
    
3.  **`mounted()`**: If you defined a `mounted` function in your logic, Lego calls it now. This is your signal that the block is officially "alive" and visible on the page

### 7. Recursive Snapping

At the very end of the function, `snap` calls itself on every child of the element:

```js
[...el.children].forEach(snap);
```

This ensures that if you have blocks nested inside blocks (including inside the shadow root), they all "wake up" in a top-down order.

## The Counterpart: `unsnap()`

To prevent memory leaks, `unsnap(el)` (also in `src/core/lifecycle.js`) carefully tears down a block:

```js
export const unsnap = (el) => {
  // 1. Call unmounted lifecycle hook first
  if (el._studs && typeof el._studs.unmounted === 'function') {
    try {
      el._studs.unmounted.call(el._studs);
    } catch (e) {
      handleError(e, el, 'unmounted');
    }
  }

  // 2. Recursively unsnap children in shadowRoot
  if (el.shadowRoot) {
    [...el.shadowRoot.children].forEach(unsnap);
  }

  // 3. Remove from active blocks tracking
  activeBlocks.delete(el);
  globalSubscribers.delete(el);

  // 4. Break circular references
  if (el._studs) {
    el._studs.$element = null;
    if (el._studs.$vars) {
      Object.keys(el._studs.$vars).forEach(key => {
        el._studs.$vars[key] = null;
      });
      el._studs.$vars = null;
    }
    el._studs.$emit = null;
    delete el._studs.$parent;
    delete el._studs.$route;
    delete el._studs.$go;
    el._studs = null;
  }

  // 5. Clear private data
  const data = privateData.get(el);
  if (data) {
    if (data.bindings) {
      data.bindings.forEach(binding => {
        binding.node = null;
        binding.anchor = null;
      });
      data.bindings = null;
    }
    data.anchor = null;
    privateData.delete(el);
  }

  // 6. Clear from for-loop pools
  if (forPools.has(el)) {
    const pool = forPools.get(el);
    pool.forEach((node, key) => {
      if (node && node._studs) node._studs = null;
    });
    pool.clear();
    forPools.delete(el);
  }

  // 7. Recursively unsnap light DOM children
  [...el.children].forEach(unsnap);
};
```

---

**Summary**: `snap()` takes a raw tag, gives it a Shadow DOM "soul," injects its HTML blueprint, sets up its reactive "brain" (`_studs`), and triggers its first breath (`mounted`).
