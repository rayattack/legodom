# The Life of a Directive: A Deep Dive

You are now a core contributor! Here is exactly how LegoDOM processes directives like `b-intersect`.

## The Pipeline

The lifecycle of a directive happens in 4 stages.

```mermaid
graph TD
    A[lifecycle.js: snap()] -->|1. Initialize| B(renderer.js: render())
    B -->|2. Check Cache| C{Has Bindings?}
    C -->|No| D[renderer.js: scanForBindings()]
    C -->|Yes| E[renderer.js: Loop Bindings]
    D -->|3. SCAN| F[directive.scan()]
    F -->|Return Binding| G[Store in data.bindings]
    G --> E
    E -->|4. EXECUTE| H[directive.execute()]
    H -->|Repeat on Change| E
    I[lifecycle.js: unsnap()] -->|5. DESTROY| J[directive.destroy()]
```

---

## 1. The Scan Phase (Compile Time)

This happens **ONLY ONCE** when a block is first initialized. We walk the DOM tree and find everything dynamic.

**File:** `src/core/renderer.js`
**Function:** `scanForBindings(container)`

 This function iterates over every node in the block's Shadow DOM.

```javascript
/* src/core/renderer.js */
export const scanForBindings = (container) => {
  // ... walker setup ...

  if (node.nodeType === Node.ELEMENT_NODE) {
    // DYNAMIC SCANNING LOOP
    // This is where we check every registered directive
    for (const [name, implementation] of Object.entries(directives)) {
      
      // CALL SCAN
      if (implementation.scan) {
        const result = implementation.scan(node, { ...helpers });
        
        // If it returns a binding object, we save it!
        if (result) bindings.push(result);
      }
    }
  }
  
  return bindings; // Returns [ { type: 'b-intersect', node: ... }, ... ]
}
```

**Key Concept:** `scan` is pure parsing. It touches the DOM to find things, but it **DOES NOT** run any logic. It just returns a "recipe" (the binding object) for later.

---

## 2. The Execute Phase (Runtime)

This happens **EVERY TIME** the state changes (and immediately after scanning).

**File:** `src/core/renderer.js`
**Function:** `render(el)`

```javascript
/* src/core/renderer.js */
export const render = (el) => {
  const data = getPrivateData(el);
  
  // 1. Get the bindings (Scanning happens here if first time)
  if (!data.bindings) data.bindings = scanForBindings(el.shadowRoot);

  // 2. Loop over every binding we found earlier
  data.bindings.forEach(b => {
    const directive = directives[b.type];
    
    // CALL EXECUTE
    if (directive) {
      directive.execute({
        binding: b,     // The object returned by scan()
        state: el.state,
        global: globals,
        helpers: { ... }
      });
    }
  });
}
```

**Key Concept:** `execute` must be fast and idempotent. It runs frequently. This is why you check `if (binding.observer) return;` — to ensure you only create expensive resources once.

---

## 3. The Destruction Phase (Cleanup)

This happens when the component is removed from the DOM (e.g., `b-if` becomes false, or page navigation).

**File:** `src/core/lifecycle.js`
**Function:** `unsnap(el)`

```javascript
/* src/core/lifecycle.js */
export const unsnap = (el) => {
  const data = privateData.get(el);
  
  if (data.bindings) {
    data.bindings.forEach(binding => {
      const directive = directives[binding.type];
      
      // CALL DESTROY (Manual implementation)
      if (directive && directive.destroy) {
        directive.destroy({ binding });
      }
    });
  }
}
```

**Key Concept:** This is your chance to clean up. The `binding` object is about to be garbage collected, so you must disconnect observers, event listeners, or timers attached to it.

---

## Summary

1.  **`scan(node)`**: "Does this node have my directive?" → Returns `Binding { ... }` or `undefined`.
2.  **`execute({ binding, state })`**: "The state updated, do your work!" → Runs logic.
3.  **`destroy({ binding })`**: "The component is dying, clean up!" → Frees memory.
