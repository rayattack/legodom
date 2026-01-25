# Scanner: Finding the Dynamic Parts

Now let's get into the "eyes" of the rendering engine. For LegoDOM to be able to update the DOM efficiently, it needs to know which specific parts of your HTML are static (never change) and which parts are dynamic (contain `[[ ]]` or `b-` directives).

## Scanning for Bindings

In `src/core/renderer.js`, the scanning happens during the `bind()` phase. Instead of re-scanning the DOM every time a variable changes, Lego scans **once**, creates a "map" of all the dynamic spots, and saves that map in the element's `privateData`.

## Location in the Codebase

The binding logic is in `src/core/renderer.js`:

```js
// src/core/renderer.js
import { getPrivateData, forPools, itemIdMap } from './registry.js';
import { config, createRegex } from '../utils/helpers.js';
import { safeEval } from '../utils/safe-eval.js';
import { directives } from '../directives/index.js';

export const bind = (root, provider) => {
  const bindings = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
  );

  let node;
  while (node = walker.nextNode()) {
    // Skip nodes inside nested blocks or b-for loops
    const isInsideNestedScope = (n) => {
      let curr = n.parentNode;
      while (curr && curr !== root) {
        if (curr.hasAttribute && curr.hasAttribute('b-for')) return true;
        if (curr.tagName && curr.tagName.includes('-') && registry[curr.tagName.toLowerCase()]) return true;
        curr = curr.parentNode;
      }
      return false;
    };

    if (isInsideNestedScope(node)) continue;

    // Process ELEMENT nodes
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Check for directives
      for (const directiveName in directives) {
        const directive = directives[directiveName];
        if (directive.scan) {
          const binding = directive.scan(node, provider);
          if (binding) bindings.push(binding);
        }
      }

      // Check for event listeners
      [...node.attributes].forEach(attr => {
        if (attr.name.startsWith('@')) {
          const eventName = attr.name.slice(1);
          bindings.push({ type: 'event', node, eventName, handler: attr.value });
        }
      });

      // Check for attribute templates
      [...node.attributes].forEach(attr => {
        const regex = createRegex();
        if (regex.test(attr.value)) {
          bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
        }
      });
    }
    // Process TEXT nodes
    else if (node.nodeType === Node.TEXT_NODE) {
      const regex = createRegex();
      if (regex.test(node.textContent)) {
        bindings.push({ type: 'text', node, template: node.textContent });
      }
    }
  }

  // Store bindings for this root
  const data = getPrivateData(provider);
  if (!data.bindings) data.bindings = [];
  data.bindings.push(...bindings);
  data.bound = true;

  return bindings;
};
```

## Why `TreeWalker`? (The Efficiency Choice)

LegoDOM uses a native browser tool called a `TreeWalker`:

```js
const walker = document.createTreeWalker(
  root,
  NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
);
```

-   **Why not `querySelectorAll('*')`?** A `TreeWalker` is much faster and more memory-efficient. It allows LegoDOM to step through every single node (including text nodes and comments) one by one.
    
-   **Node Types**: By specifying `SHOW_ELEMENT | SHOW_TEXT | SHOW_COMMENT`, we can process elements (for directives), text nodes (for `[[ ]]` expressions), and comments (for `b-if` anchors) all in one pass.

## The "Nested Scope" Shield

One of the smartest parts of this function is the `isInsideNestedScope` check:

```js
const isInsideNestedScope = (n) => {
  let curr = n.parentNode;
  while (curr && curr !== root) {
    if (curr.hasAttribute && curr.hasAttribute('b-for')) return true;
    if (curr.tagName && curr.tagName.includes('-') && registry[curr.tagName.toLowerCase()]) return true;
    curr = curr.parentNode;
  }
  return false;
};
```

-   If the scanner finds an element that is inside a `b-for` loop or belongs to a **different** custom block, it stops.
    
-   **Reasoning**: You don't want the parent block to try and manage the internal text of a child block. This maintains **Encapsulation**.

## Directive Scanning (Modular Approach)

Instead of hardcoding checks for each directive, the modular version delegates to directive modules:

```js
// Check for directives
for (const directiveName in directives) {
  const directive = directives[directiveName];
  if (directive.scan) {
    const binding = directive.scan(node, provider);
    if (binding) bindings.push(binding);
  }
}
```

Each directive in `src/directives/` can export a `scan` function:

```js
// src/directives/b-show.js
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

This makes the system extensible - you can add new directives without modifying the core renderer.

## What it Looks For

As it walks the tree, it populates a `bindings` array with "Instruction Objects":

1. **Directives**: `b-show`, `b-if`, `b-for`, `b-text`, `b-html`, `b-sync`
2. **Events**: Attributes starting with `@` (like `@click`)
3. **Text Templates**: Text nodes containing `[[ ]]`
4. **Attribute Templates**: Attributes with `[[ ]]` (like `class="btn [[ color ]]"`)

## The "Instruction Object" Structure

When it finds something, it pushes an object like this into the list:

```js
{ 
  type: 'text', 
  node: [The actual TextNode], 
  template: 'Hello [[ user.name ]]' 
}
```

By storing the **actual Node reference**, LegoDOM can update the screen later with surgical precision. It doesn't have to search the DOM again; it just goes straight to that specific memory address and updates the value.

## Why Regex? (The "Pragmatic" Choice)

You will notice we use `createRegex()` from `src/utils/helpers.js` to find bindings:

```js
// src/utils/helpers.js
const REGEX_CACHE = new Map();

export const createRegex = () => {
  const [start, end] = getDelimiters();
  const key = start + end;
  if (REGEX_CACHE.has(key)) return REGEX_CACHE.get(key);

  const s = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const e = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${s}(.*?)${e}`, 'g');
  REGEX_CACHE.set(key, regex);
  return regex;
};
```

**"Regex is bad for HTML!"** they say.

Usually, yes. But we are not parsing *arbitrary* HTML to build a DOM. We are scanning *specific known tokens* inside trusted templates.

**The Trade-off:**
- **AST Parser**: Reliable, but heavy (10kb+)
- **Regex Scanner**: Good enough for 99.9% of bindings, extremely light (<1kb)
- **Cached**: The regex is compiled once and cached, making subsequent renders extremely fast

Since LegoDOM targets **speed** and **size** (<10kb total), Regex is the correct architectural choice. We mitigate edge cases by:
1. Not scanning inside `<script>` or `<style>` tags
2. Not crossing custom element boundaries
3. Not scanning inside `b-for` loops (they handle their own scanning)

---

**Summary**: The scanning phase is a one-time "reconnaissance mission." It maps out every dynamic part of your block so that future updates are lightning-fast. The modular architecture in `src/directives/` makes the system extensible, while the `TreeWalker` and cached regex ensure maximum performance.
