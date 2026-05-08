# Lights, Camera, Action: Event Handling

This is how LegoDOM makes your blocks interactive by connecting DOM events (clicks, keypresses, submits) directly to the methods you wrote in your **Lego File** (Single File Block), autodiscovered `.lego` file, `<template />` tag, or `Lego.block()` call.

## Event Handling (The `@event` Syntax)

LegoDOM uses a shorthand syntax for event listeners: `@event-name="methodName"`. For example, `@click="increment"` or `@submit="saveUser"`.

## Location in the Codebase

Event binding happens in `src/core/renderer.js` during the `bind()` phase:

```js
// src/core/renderer.js
import { safeEval } from '../utils/safe-eval.js';

export const bind = (root, provider) => {
  // ... scanning setup ...
  
  // Process ELEMENT nodes
  if (node.nodeType === Node.ELEMENT_NODE) {
    // Check for event listeners
    [...node.attributes].forEach(attr => {
      if (attr.name.startsWith('@')) {
        const fullEventName = attr.name.slice(1); // Remove '@'
        const [eventName, ...modifiers] = fullEventName.split('.');
        
        bindings.push({
          type: 'event',
          node,
          eventName,
          modifiers,
          handler: attr.value
        });
        
        // Immediately attach the listener
        attachEventListener(node, eventName, attr.value, modifiers, provider);
      }
    });
  }
  
  // ... rest of binding logic ...
};

const attachEventListener = (node, eventName, handlerExpr, modifiers, provider) => {
  const state = provider._studs;
  
  const wrappedHandler = (event) => {
    // Apply modifiers before calling handler
    if (modifiers.includes('prevent')) event.preventDefault();
    if (modifiers.includes('stop')) event.stopPropagation();
    if (modifiers.includes('self') && event.target !== node) return;
    
    // Key modifiers
    if (modifiers.includes('enter') && event.key !== 'Enter') return;
    if (modifiers.includes('esc') && event.key !== 'Escape') return;
    if (modifiers.includes('space') && event.key !== ' ') return;
    
    // System key modifiers
    if (modifiers.includes('ctrl') && !event.ctrlKey) return;
    if (modifiers.includes('alt') && !event.altKey) return;
    if (modifiers.includes('shift') && !event.shiftKey) return;
    if (modifiers.includes('meta') && !event.metaKey) return;
    
    // Execute handler
    try {
      safeEval(handlerExpr, { ...state, event, $event: event }, true);
    } catch (e) {
      handleError(e, provider, 'event');
    }
  };
  
  node.addEventListener(eventName, wrappedHandler);
};
```

## The `bind()` Phase

During the `snap()` process, after the Shadow DOM is attached, LegoDOM calls `bind(shadowRoot, el)`.

-   **Scanning for Attributes**: It looks through all elements in the Shadow DOM for any attribute starting with `@`.
    
-   **The Match**: If it finds `@click="toggle"`, it identifies `click` as the event and `toggle` as the function name to look for in `_studs`.

## Context Preservation

When you click a button, the browser usually sets the keyword `this` to the button itself. However, in Lego, you want `this` to be your **reactive state**.

The `safeEval` function (from `src/utils/safe-eval.js`) evaluates the handler in the context of the block's state:

```js
safeEval(handlerExpr, { ...state, event, $event: event }, true);
```

By passing `state` as the scope, any method call like `toggle()` executes with access to the block's data. The `true` flag allows side effects (assignments, function calls).

## Argument Support

LegoDOM is flexible with how you call these methods:

-   **Standard Call**: `@click="doSomething"` passes the native `Event` object as `event` or `$event`.
    
-   **Parameterized Call**: `@click="deleteItem(5)"`. LegoDOM evaluates the expression with arguments.
    
-   **Event Access**: `@click="move(event, 10)"` or `@click="log($event.target.value)"` - the event object is injected into the scope.

## Event Modifiers

Lego includes built-in modifiers to handle common web patterns without writing extra JS:

### Behavior Modifiers

-   **`.prevent`**: Automatically calls `event.preventDefault()`. Great for `@submit.prevent="save"`.
    
-   **`.stop`**: Calls `event.stopPropagation()` to stop the event from bubbling up to parent elements.
    
-   **`.self`**: Only triggers if the event target is the element itself (not a child).

### Key Modifiers

-   **`.enter`**: Only triggers if the "Enter" key was pressed (perfect for search bars).
    
-   **`.esc`**: Only triggers on Escape key.
    
-   **`.space`**: Only triggers on Space key.

### System Key Modifiers

-   **`.ctrl`**: Only triggers if Ctrl key is held.
    
-   **`.alt`**: Only triggers if Alt key is held.
    
-   **`.shift`**: Only triggers if Shift key is held.
    
-   **`.meta`**: Only triggers if Meta/Command key is held.

### Modifier Combinations

You can chain modifiers:

```html
<input @keydown.enter.ctrl="advancedSearch" />
<button @click.prevent.stop="dangerous Action" />
```

## Advanced Pattern Example

```html
<!-- In your .lego file template -->
<script>
export default {
  searchTerm: '',
  
  updateSearch(event) {
    this.searchTerm = event.target.value;
  },
  
  search() {
    console.log('Searching for:', this.searchTerm);
  },
  
  clearSearch() {
    this.searchTerm = '';
  },
  
  handleSubmit(event) {
    // event.preventDefault() already called by .prevent modifier
    this.search();
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input 
      @input="updateSearch" 
      @keydown.enter="search"
      @keydown.esc="clearSearch"
    />
    <button @click.prevent.stop="search">Search</button>
  </form>
</template>
```

## Integration with Reactivity

Because handlers are evaluated with the state scope, any mutations trigger the reactive proxy:

```js
// In your handler
this.count++; // This triggers the proxy's set trap
// Which calls batcher.add(el)
// Which queues a render()
```

This creates the reactive loop:
1. User clicks button
2. Handler updates state
3. Proxy detects change
4. Batcher queues render
5. UI updates

---

**Summary**: The `@` syntax automates `addEventListener`, ensures the correct context for your methods via `safeEval`, and provides powerful modifiers to keep your block logic clean. All event handling is centralized in `src/core/renderer.js` and integrates seamlessly with the reactive system.
