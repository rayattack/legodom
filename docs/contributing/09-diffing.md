# He said, She said, They Said, Who Said?

This topic is about the "Power Struggle" inside the code. When a block is born, it needs to know what its data is. LegoDOM looks at three different places to find that data, and it has a strict hierarchy of who wins in a conflict.

## The Three-Tier Data System

Inside the `snap(el)` function (located in `src/core/lifecycle.js`), LegoDOM merges data from three sources. This isn't just a simple object; it is the result of a three-way merge with a strict priority system.

## Location in the Codebase

The tier system is implemented in `src/core/lifecycle.js`:

```js
// src/core/lifecycle.js
import { legoFileLogic } from './registry.js';
import { parseJSObject } from '../utils/safe-eval.js';
import { findAncestor } from '../utils/dom.js';
import { mergeDescriptors } from '../utils/helpers.js';

export const snap = (el) => {
  // ... setup code ...
  
  // TIER 1: Logic from Lego.block (Lego File)
  const scriptLogic = legoFileLogic.get(name) || {};

  // TIER 2: Logic from the <template b-logic="..."> attribute
  const templateLogic = parseJSObject(
    templateNode.getAttribute('b-logic') || 
    templateNode.getAttribute('b-data') || '{}'
  );

  // TIER 3: Logic from the <my-comp b-data="..."> tag
  // Scoped to parent's state for prop access
  const parentBlock = findAncestor(el, '*') || findAncestor(el.getRootNode().host, '*');
  const parentScope = parentBlock?.state || {};
  const instanceLogic = parseJSObject(
    el.getAttribute('b-logic') || 
    el.getAttribute('b-data') || '{}',
    parentScope
  );

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

  // Merge all tiers (order matters!)
  mergeDescriptors(scriptLogic, baseState);
  mergeDescriptors(templateLogic, baseState);
  mergeDescriptors(instanceLogic, baseState);

  // Create reactive proxy
  el._studs = reactive(baseState, el);
  
  // ... rest of snap logic ...
};
```

## The Three Tiers of Authority

### 1. Tier 1: The Global Definition (Lowest Priority)

```js
const scriptLogic = legoFileLogic.get(name) || {};
```

This is the JavaScript object you provided when you called `Lego.block()` or defined in a `.lego` file's `<script>` section. It contains your default values and methods. It's the "fallback" data.

**Example:**
```js
// Via Lego.block()
Lego.block('user-card', template, {
  name: 'Default User',
  role: 'guest'
});

// Or via .lego file <script>
export default {
  name: 'Default User',
  role: 'guest'
}
```

This data is stored in the `legoFileLogic` Map (from `src/core/registry.js`).

### 2. Tier 2: The Template Attributes (Middle Priority)

```js
const templateLogic = parseJSObject(
  templateNode.getAttribute('b-logic') || 
  templateNode.getAttribute('b-data') || '{}'
);
```

Lego looks at the `<template>` tag itself in your HTML. If you added a `b-logic` or `b-data` attribute there, it overrides the global definition.

**Example:**
```html
<template b-id="user-card" b-logic="{ role: 'admin' }">
  <div>{{ name }} - {{ role }}</div>
</template>
```

This is useful for creating "variants" of a block template without writing new JavaScript.

### 3. Tier 3: The Instance Attributes (Highest Priority)

```js
const instanceLogic = parseJSObject(
  el.getAttribute('b-logic') || 
  el.getAttribute('b-data') || '{}',
  parentScope
);
```

This is the data attached to the specific tag on your page. This is the "Final Word."

**Example:**
```html
<user-card b-data="{ name: 'Alice', role: 'superadmin' }"></user-card>
```

Notice that the instance logic is evaluated with `parentScope`. This allows you to pass props from parent blocks:

```html
<!-- Parent block with users array -->
<user-list>
  <user-card b-data="{ user: users[0] }"></user-card>
</user-list>
```

## The Merge Strategy: `mergeDescriptors`

Unlike simple object spreading, LegoDOM uses `mergeDescriptors()` from `src/utils/helpers.js`:

```js
// src/utils/helpers.js
export const mergeDescriptors = (source, target) => {
  if (!source || !target) return;
  Object.getOwnPropertyNames(source).forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    Object.defineProperty(target, key, desc);
  });
};
```

This preserves **getters and setters**, which is critical for:
- Reactive `$route` and `$go` helpers
- `$parent` lookups
- `$db` descriptors from `src/features/persistence.js`

**The order matters:**
```js
mergeDescriptors(scriptLogic, baseState);    // Tier 1
mergeDescriptors(templateLogic, baseState);  // Tier 2
mergeDescriptors(instanceLogic, baseState);  // Tier 3
```

Later tiers overwrite earlier ones. So: **Instance > Template > Script**.

## The `parseJSObject` Utility

Located in `src/utils/safe-eval.js`:

```js
export const parseJSObject = (str, scope = {}) => {
  if (!str || str === '{}') return {};
  try {
    const keys = Object.keys(scope);
    const values = keys.map(k => scope[k]);
    return new Function(...keys, `return (${str})`)(...values);
  } catch (e) {
    console.error('[Lego] Failed to parse object:', str, e);
    return {};
  }
};
```

-   **Why not `JSON.parse`?** JSON is strict (requires double quotes, no functions).
    
-   **LegoDOM's Way**: It uses `new Function()` to allow you to write actual JavaScript inside your HTML attributes, including functions, arrays, and variable references.

## Scope Inheritance for Props

The key innovation in the tier system is that **Tier 3 (instance) is scoped to the parent block**:

```js
const parentBlock = findAncestor(el, '*');
const parentScope = parentBlock?.state || {};
const instanceLogic = parseJSObject(el.getAttribute('b-data') || '{}', parentScope);
```

This enables prop passing:

```html
<!-- Parent block -->
<template b-id="todo-app">
  <todo-item b-for="item in todos" b-data="{ todo: item }"></todo-item>
</template>
```

The `b-data="{ todo: item }"` expression is evaluated in the context of the parent's state, giving the child access to `item`.

## Special Helpers Injected

After merging the three tiers, LegoDOM injects framework helpers into `baseState`:

```js
const baseState = {
  $vars: {},              // Element references (via b-var)
  $element: el,           // The DOM element itself
  get $parent() { ... },  // Lazy lookup of parent block
  $emit: (name, detail) => { ... },  // Event emission
  get $route() { ... },   // Router state (from src/features/router.js)
  get $go() { ... }       // Router navigation (from src/features/router.js)
};
```

These are available in all blocks automatically.

---

**Summary**: A block's data is a "Cake" with three layers. The Script Logic (Tier 1) is the foundation, the Template Logic (Tier 2) is the middle layer, and the Instance Logic (Tier 3) is the frosting on top. The "Frosting" (Instance) is what the user ultimately experiences. This is implemented through `mergeDescriptors()` which preserves property descriptors for reactive helpers.
