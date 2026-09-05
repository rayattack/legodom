# Paint Me HTML: The Render Engine

In Topic 11, we mapped out where the dynamic "holes" in your HTML are. Now, we look at the engine that actually fills them with data. The `render()` function is the most frequently called piece of code in LegoDOM-it is the bridge between JavaScript state and the pixels on the screen.

## The Rendering Engine

The `render(el)` function doesn't refresh the whole block. Instead, it iterates through the "Instruction Objects" (bindings) created during the scanning phase and updates only what is necessary.

## Location in the Codebase

The render function is in `src/core/renderer.js`:

```js
// src/core/renderer.js
import { getPrivateData } from './registry.js';
import { config } from '../utils/helpers.js';
import { directives } from '../directives/index.js';

export const render = (el) => {
  const state = el._studs;
  if (!state) return;
  
  const data = getPrivateData(el);
  if (data.rendering) return; // Prevent recursion
  
  data.rendering = true;

  try {
    const shadow = el.shadowRoot;
    if (!shadow) return;

    // Performance tracking (if monitoring plugin installed)
    if (config.metrics?.onRenderStart) config.metrics.onRenderStart(el);

    // Get all bindings for this element
    if (!data.bindings) {
      // Shouldn't happen (bind() should have been called), but failsafe
      bind(shadow, el);
    }

    // Execute each binding
    data.bindings.forEach(binding => {
      const directive = directives[binding.type];
      if (directive && directive.execute) {
        directive.execute({ binding, state, el });
      }
    });

    if (config.metrics?.onRenderEnd) config.metrics.onRenderEnd(el);
  } catch (e) {
    handleError(e, el, 'render');
  } finally {
    data.rendering = false;
  }
};
```

## The Guard Rails

Before doing any work, `render` checks two things:

-   **The State**: It ensures `el._studs` exists.
    
-   **The Recursion Lock**: It sets `data.rendering = true` at the start and `false` at the end. This prevents a "Render Loop" where an update triggers a render, which accidentally triggers another update, creating an infinite loop.

##  Modular Directive Execution

The key difference in the modular version is that `render()` doesn't have hardcoded logic for each directive type. Instead, it delegates to directive modules:

```js
data.bindings.forEach(binding => {
  const directive = directives[binding.type];
  if (directive && directive.execute) {
    directive.execute({ binding, state, el });
  }
});
```

Each directive lives in its own file in `src/directives/`:

### Example: `b-show` Directive

```js
// src/directives/b-show.js
import { safeEval } from '../utils/safe-eval.js';

export const bShow = {
  scan: (node) => {
    if (node.hasAttribute('b-show')) {
      return {
        type: 'b-show',
        node,
        expr: node.getAttribute('b-show')
      };
    }
  },
  execute: ({ binding, state }) => {
    const show = !!safeEval(binding.expr, state);
    binding.node.style.display = show ? '' : 'none';
  }
};
```

### Example: `b-text` Directive

```js
// src/directives/b-text.js
import { resolve, escapeHTML } from '../utils/helpers.js';

export const bText = {
  scan: (node) => {
    if (node.hasAttribute('b-text')) {
      return {
        type: 'b-text',
        node,
        path: node.getAttribute('b-text')
      };
    }
  },
  execute: ({ binding, state }) => {
    const value = resolve(binding.path, state);
    binding.node.textContent = escapeHTML(value ?? '');
  }
};
```

### Example: Template Text (Mustaches)

```js
// src/directives/index.js (for inline templates)
import { createRegex } from '../utils/helpers.js';
import { safeEval } from '../utils/safe-eval.js';
import { escapeHTML } from '../utils/dom.js';

export const textTemplate = {
  // This is handled during bind() as type: 'text'
  execute: ({ binding, state }) => {
    const regex = createRegex();
    const output = binding.template.replace(regex, (_, expr) => {
      const value = safeEval(expr.trim(), state);
      return escapeHTML(value ?? '');
    });
    
    if (binding.node.textContent !== output) {
      binding.node.textContent = output;
    }
  }
};
```

## Directive Registry

All directives are registered in `src/directives/index.js`:

```js
// src/directives/index.js
import { bIf } from './b-if.js';
import { bFor } from './b-for.js';
import { bShow } from './b-show.js';
import { bText } from './b-text.js';
import { bHtml } from './b-html.js';
import { bSync } from './b-sync.js';

export const directives = {
  'b-if': bIf,
  'b-for': bFor,
  'b-show': bShow,
  'b-text': bText,
  'b-html': bHtml,
  'b-sync': bSync,
  'text': textTemplate,
  'attr': attrTemplate,
  'event': eventBinding
};
```

This makes the system highly extensible-you can add new directives without modifying the core renderer.

## Surgical Execution

The function loops through `data.bindings` and performs specific actions based on the `type`:

-   **`b-show`**: Evaluates the expression. If false, sets `display: none`. This is CSS-based; the element stays in the DOM but becomes invisible.
    
-   **`b-if`**: Actually removes/adds the node from the DOM using comment anchors.
    
-   **`b-text`**: Uses the `resolve()` helper (from `src/utils/helpers.js`) to find the value in your state and sets the `textContent`.
    
-   **`b-for`**: Handles list rendering with DOM recycling (see `src/directives/b-for.js` for full details).
    
-   **`text` (Mustaches)**: Takes the original template (e.g., `Count: [[ count ]]`), replaces the expression with the actual value, and updates the text node.
    
-   **`attr`**: Updates attributes like `src`, `href`, or `class`. Special handling for `class` attribute to ensure browser applies styles correctly.

## The `safeEval` Bridge & Security

`src/utils/safe-eval.js` is the renderer's door into expression evaluation, and
`src/utils/expression.js` is what stands behind it. No template text is ever
handed back to the JavaScript engine as source: there is no `eval`, and no
`new Function` on the expression path.

### The pipeline

1. **Tokenizer** (`tokenize`) turns the source into tokens: numbers, strings,
   template literals, identifiers, punctuators. It records each token's offset
   so a syntax error can point at the character that broke.
2. **Parser** (`parse`) is a precedence-climbing (Pratt style) parser producing a
   small AST. It covers what templates actually need: member access and optional
   chaining, calls, `new` on the allowlisted constructors, unary and binary
   operators, ternaries, assignment and `++`/`--`, arrow functions with
   expression bodies, array and object literals, template literals.
3. **Compiler** (`compile`) walks the AST once and returns a closure
   `(scope, ctx) => value`. The result is cached by source string in an
   `LRUCache(1000)`, so a binding compiles once and then just runs.

```js
// src/core/renderer.js
const out = b.template.replace(createRegex(), (_, k) =>
  safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
```

### What safeEval adds on top

- The `$`-helpers (`$element`, `$route`, `$params`, `$go`, `$db`, `$mount`,
  `$emit`, `$ancestors`, `$registry`), which shadow state by name.
- Auto-invoke: a function-valued result is called only in event-handler context.
- Error policy: `ReferenceError` is swallowed so one typo cannot blank a page,
  unless `Lego.config.strict` is on. Everything else propagates to the error
  boundary.

### What the sandbox does and does not guarantee

Identifier lookup is entirely the compiler's: helpers, then state, then the
named context values (`global`, `self`, `event`, `$event`), then a fixed
allowlist of safe globals (`Math`, `JSON`, `Date`, `Number`, `String`,
`Boolean`, `Array`, `Object`, `parseInt`, `parseFloat`, `isNaN`, `isFinite`,
the URI helpers, `console`, `Intl`, `Promise`, `Set`, `Map`, `RegExp`).
Anything else is a `ReferenceError`, so `window`, `document`, `fetch`,
`localStorage` and friends are simply not in scope. Property reads that would
hand back a prototype or a constructor function are denied and warn.

It guarantees three things: CSP compliance with no `unsafe-eval`, no accidental
reach into host globals, and protection against prototype pollution. It is
**not** a security boundary for untrusted template authors. `self` and
`$element` are real DOM nodes, and any DOM node reaches `document` in two hops.
Templates are code: treat them with the same trust you give the rest of your
source.

## Performance Optimizations

### 1. Change Detection

Before updating DOM properties, check if they actually changed:

```js
// b-text example
const newText = escapeHTML(value ?? '');
if (binding.node.textContent !== newText) {
  binding.node.textContent = newText;
}
```

This avoids triggering unnecessary browser reflows.

### 2. Cached Regexes

The `createRegex()` function from `src/utils/helpers.js` caches compiled regexes to avoid repeated pattern compilation.

### 3. DOM Recycling (b-for)

The `b-for` directive (in `src/directives/b-for.js`) maintains pools of DOM nodes and reuses them instead of creating new ones:

```js
// Simplified version of b-for pooling
const pool = forPools.get(binding.node) || new Map();
list.forEach((item, i) => {
  let child = pool.get(itemKey);
  if (!child) {
    // Create new
    child = createElement(template);
    pool.set(itemKey, child);
  }
  // Reuse existing child
  updateChild(child, item);
});
```

## Integration with the Batcher

Remember from Topic 3 that renders are queued via the batcher:

```js
// src/core/reactive.js
set: (t, k, v) => {
  const old = t[k];
  const r = Reflect.set(t, k, v);
  if (old !== v) {
    batcher.add(el); // Queue render
  }
  return r;
}
```

The batcher collects all state changes in a frame and calls `render(el)` once per affected element.

---

**Summary**: `render()` is a "Loop of Truth." It walks through the bindings map created by the scanner, evaluates the current state of your data, and applies those values to the specific DOM nodes that need them. The modular directive system in `src/directives/` makes it extensible, while caching and change detection ensure maximum performance.
