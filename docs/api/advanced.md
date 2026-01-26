# Advanced API

These APIs are intended for advanced use cases like building development tools, testing utilities, or custom block loaders.

## Lego.snap()

Manually initializes a LegoDOM block element.

```javascript
Lego.snap(element)
```

### Parameters

- `element` (HTMLElement) - The custom element to initialize

### Description

`snap()` performs the following operations on a block element:

1. **Checks if already initialized** - Skips if the element has already been "snapped"
2. **Attaches Shadow DOM** - Creates and attaches a shadow root
3. **Clones template** - Copies the block's template into the shadow root
4. **Applies styles** - Attaches any registered stylesheets via `b-stylesheets`
5. **Merges state** - Combines Block logic, template `b-logic`, and instance `b-logic`
6. **Creates reactive state** - Wraps the state in a Proxy for reactivity
7. **Binds events** - Attaches event listeners from `@click`, `@input`, etc.
8. **Renders** - Processes all directives (`b-show`, `b-for`, etc.)
9. **Calls `mounted()`** - Invokes the block's lifecycle hook

### When to Use

**Common use cases:**

- **Dynamic block creation** - When programmatically creating block outside the normal DOM flow
- **Testing** - Manually initializing block in test environments
- **Development tools** - Building block preview tools (like Lego Studio)
- **Custom loaders** - Implementing alternative block loading strategies

**Note**: While LegoDOM primarily uses Native Web Components, it will start a lightweight `MutationObserver` for **Auto-Discovery** if you provide a `loader`. This watches for unknown tags to fetch from the server.

### Example: Dynamic Block Preview

```javascript
// Create a mount point
const container = document.createElement('div');
document.body.appendChild(container);

// Dynamically create and initialize a block
const block = document.createElement('my-block');
container.appendChild(block);

// Manually initialize (needed if container is in Shadow DOM)
Lego.snap(block);
```

### Example: Testing

```javascript
// In a test file
import { Lego } from 'lego-dom';

test('my-block renders correctly', () => {
  const el = document.createElement('my-block');
  document.body.appendChild(el);
  
  // Manually initialize for testing
  Lego.snap(el);
  
  // Now you can test the block
  expect(el.shadowRoot.querySelector('h1').textContent).toBe('Hello');
});
```

### Shadow DOM Considerations

If you're creating block inside a Shadow DOM (like in Lego Studio), you need to:

1. Append the element to the Shadow DOM
2. Call `Lego.snap()` to initialize it

```javascript
// Inside a Shadow DOM block
const mount = this.$element.shadowRoot.getElementById('preview');
const block = document.createElement('user-card');
mount.appendChild(block);
Lego.snap(block); // Required - observer doesn't watch Shadow DOMs
```

---

## Lego.unsnap()

Cleans up and destroys a LegoDOM block.

```javascript
Lego.unsnap(element)
```

### Parameters

- `element` (HTMLElement) - The block element to destroy

### Description

`unsnap()` performs cleanup operations:

1. **Removes from active block** - Unregisters from LegoDOM's tracking
2. **Cleans up event listeners** - Prevents memory leaks
3. **Removes from DOM** - Detaches the element from its parent

### When to Use

- **Programmatic cleanup** - When you need to explicitly destroy a block
- **Memory management** - In long-running apps with many dynamic block
- **Testing teardown** - Cleaning up after tests

### Example: Block Lifecycle Management

```javascript
// Create and initialize
const widget = document.createElement('my-widget');
document.body.appendChild(widget);
Lego.snap(widget);

// Later, clean up
Lego.unsnap(widget);
// widget is now removed from DOM and cleaned up
```

### Example: Dynamic Preview Tool

```javascript
// Preview block manager
class BlockPreview {
  showBlock(tagName) {
    // Clean up previous block
    if (this.current) {
      Lego.unsnap(this.current);
    }
    
    // Create and show new block
    this.current = document.createElement(tagName);
    this.container.appendChild(this.current);
    Lego.snap(this.current);
  }
}
```

---

## Best Practices

### ✅ Do

- Use `snap()` when creating block in Shadow DOMs
- Use `snap()` in testing environments for explicit control
- Call `unsnap()` when programmatically removing block
- Check if an element is already initialized before calling `snap()`

### ❌ Don't

- Don't call `snap()` on block in the normal DOM (observer handles it)
- Don't call `snap()` multiple times on the same element
- Don't forget to call `unsnap()` when cleaning up dynamic block
- Don't use these APIs unless you have a specific advanced use case

---

## Related

- [Lego.init()](/api/config#init) - Initialize LegoDOM on a root element
- [Lifecycle Hooks](/api/lifecycle) - Block lifecycle methods
- [Lego Studio](https://github.com/rayattack/legodom/tree/main/lego-studio) - Example usage in a development tool
