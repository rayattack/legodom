# Directives: The Building Blocks of Interactivity

Directives like `b-if`, `b-text`, `b-for`, and `b-sync` are the "Instructions" that bridge the gap between your JavaScript state and the DOM. Without them, your state would just be numbers and strings sitting in memory with no way to manifest on the screen.

## The Modular Directive System

In the refactored architecture, each directive lives in its own file in `src/directives/`. They all export a consistent interface with `scan` and `execute` methods.

Location: `src/directives/index.js`

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
  'b-sync': bSync
};
```

## Conditional Directives: `b-if` & `b-show`

### 1. Simple Visibility (`b-show`)

Location: `src/directives/b-show.js`

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

**How it works:**
-   Uses `display: none` instead of removing from DOM (fast!)
-   Element remains in memory and lifecycle hooks stay active
-   No re-layout calculations needed

### 2. Conditional Rendering (`b-if`)

Location: `src/directives/b-if.js`

```js
// src/directives/b-if.js
import { safeEval } from '../utils/safe-eval.js';

export const bIf = {
  scan: (node) => {
    if (node.hasAttribute('b-if')) {
      const expr = node.getAttribute('b-if');
      // Create a comment anchor to mark the position
      const anchor = document.createComment(`b-if: ${expr}`);
      node.parentNode.insertBefore(anchor, node);
      
      return {
        type: 'b-if',
        node,
        anchor,
        expr
      };
    }
  },
  
  execute: ({ binding, state }) => {
    const condition = !!safeEval(binding.expr, state);
    const isAttached = !!binding.node.parentNode;
    
    if (condition && !isAttached) {
      // Condition became true - swap anchor with node
      binding.anchor.parentNode.replaceChild(binding.node, binding.anchor);
    } else if (!isAttached) {
      // Condition became false - swap node with anchor
      binding.node.parentNode.replaceChild(binding.anchor, binding.node);
    }
  }
};
```

**The Anchor Pattern:**
-   When `b-if="false"`, the element is removed but a comment node marks its position
-   Comment nodes are invisible and don't affect layout
-   When condition becomes true, we swap the comment back with the element
-   This preserves exact DOM position for re-insertion

## Text Directives: `b-text` & `b-html`

### 3. Safe Text Interpolation (`b-text`)

Location: `src/directives/b-text.js`

```js
// src/directives/b-text.js
import { resolve } from '../utils/helpers.js';
import { escapeHTML } from '../utils/dom.js';

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

**Security Note:** Always uses `escapeHTML()` from `src/utils/dom.js` to prevent XSS attacks.

### 4. Raw HTML Injection (`b-html`)

Location: `src/directives/b-html.js`

```js
// src/directives/b-html.js
import { safeEval } from '../utils/safe-eval.js';

export const bHtml = {
  scan: (node) => {
    if (node.hasAttribute('b-html')) {
      return {
        type: 'b-html',
        node,
        expr: node.getAttribute('b-html')
      };
    }
  },
  
  execute: ({ binding, state }) => {
    // SECURITY CRITICAL: This is the only place we set innerHTML directly
    binding.node.innerHTML = safeEval(binding.expr, state) || '';
  }
};
```

**Security Warning:** By forcing explicit `b-html` usage, code reviews can easily spot potentially dangerous HTML injection.

## List Rendering: `b-for` & The Pool

Location: `src/directives/b-for.js`

This is the most complex directive. It handles:
1. Template extraction
2. DOM recycling via pools
3. Local scope creation
4. Item identity tracking

```js
// src/directives/b-for.js (simplified)
import { safeEval } from '../utils/safe-eval.js';
import { forPools, itemIdMap } from '../core/registry.js';
import { bind } from '../core/renderer.js';

export const bFor = {
  scan: (node, provider) => {
    if (node.hasAttribute('b-for')) {
      const expr = node.getAttribute('b-for');
      const match = expr.match(/^\s*(\w+)\s+in\s+(.+)\s*$/);
      
      if (match) {
        const [, itemName, listExpr] = match;
        const template = node.innerHTML;
        node.innerHTML = ''; // Clear for dynamic rendering
        
        return {
          type: 'b-for',
          node,
          itemName,
          listExpr,
          template
        };
      }
    }
  },
  
  execute: ({ binding, state, el }) => {
    const list = safeEval(binding.listExpr, state) || [];
    
    // Get or create pool for this b-for
    if (!forPools.has(binding.node)) {
      forPools.set(binding.node, new Map());
    }
    const pool = forPools.get(binding.node);
    
    const currentKeys = new Set();
    
    list.forEach((item, index) => {
      // Generate stable key for item
      const key = generateKey(item, index);
      currentKeys.add(key);
      
      // Reuse or create child element
      let child = pool.get(key);
      if (!child) {
        child = createFromTemplate(binding.template);
        pool.set(key, child);
        bind(child, el, { loopContext: { itemName: binding.itemName, index } });
      }
      
      // Create local scope with prototype chain
      const localScope = Object.assign(Object.create(state), {
        [binding.itemName]: item,
        $index: index
      });
      
      // Update child with item data
      updateChild(child, localScope);
      
      // Ensure correct position
      if (binding.node.children[index] !== child) {
        binding.node.insertBefore(child, binding.node.children[index] || null);
      }
    });
    
    // Remove unused items from pool
    for (const [key, child] of pool.entries()) {
      if (!currentKeys.has(key)) {
        child.remove();
        pool.delete(key);
      }
    }
  }
};
```

**Key Features:**
1. **DOM Recycling:** Reuses existing elements instead of creating new ones
2. **Stable Keys:** Objects get `__id`, primitives use `index-value`
3. **Prototype Chain:** Local scope inherits from parent state
4. **Pruning:** Removes elements no longer in the list

## Two-Way Binding: `b-sync`

Location: `src/directives/b-sync.js`

```js
// src/directives/b-sync.js
import { resolve } from '../utils/helpers.js';
import { syncModelValue } from '../utils/dom.js';

export const bSync = {
  scan: (node, provider) => {
    if (node.hasAttribute('b-sync')) {
      const path = node.getAttribute('b-sync');
      
      // Attach event listeners
      const updateState = (e) => {
        const state = provider._studs;
        if (!state) return;
        
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((o, k) => o?.[k], state);
        
        if (target) {
          const newVal = node.type === 'checkbox' ? node.checked : 
                         node.type === 'number' ? parseFloat(node.value) :
                         node.value;
          
          if (target[last] !== newVal) {
            target[last] = newVal; // Triggers reactive proxy
          }
        }
      };
      
      node.addEventListener('input', updateState);
      node.addEventListener('change', updateState);
      
      return {
        type: 'b-sync',
        node,
        path
      };
    }
  },
  
  execute: ({ binding, state }) => {
    const value = resolve(binding.path, state);
    syncModelValue(binding.node, value);
  }
};
```

The `syncModelValue` helper (in `src/utils/dom.js`) handles the complexity of different input types:

```js
// src/utils/dom.js
export const syncModelValue = (el, value) => {
  // Avoid updating if user is currently typing
  if (document.activeElement === el && el.value === String(value ?? '')) {
    return;
  }
  
  if (el.type === 'checkbox') {
    el.checked = !!value;
  } else if (el.type === 'radio') {
    el.checked = el.value === String(value);
  } else {
    el.value = value ?? '';
  }
};
```

**Prevents Echo Effect:** Checks if element is focused before updating to avoid cursor jumping.

## Extending the System

Want to add a custom directive? Just create a new file:

```js
// src/directives/b-tooltip.js
export const bTooltip = {
  scan: (node) => {
    if (node.hasAttribute('b-tooltip')) {
      return {
        type: 'b-tooltip',
        node,
        expr: node.getAttribute('b-tooltip')
      };
    }
  },
  
  execute: ({ binding, state }) => {
    const text = safeEval(binding.expr, state);
    binding.node.title = text;
  }
};
```

Then register it in `src/directives/index.js`:

```js
import { bTooltip } from './b-tooltip.js';

export const directives = {
  // ... existing directives
  'b-tooltip': bTooltip
};
```

---

**Summary**: The modular directive system in `src/directives/` provides a clean, extensible architecture. Each directive is self-contained with scan and execute methods. The system uses clever techniques like comment anchors (`b-if`), DOM pools (`b-for`), and prototype chains (local scopes) to achieve maximum performance while maintaining clean, understandable code.
