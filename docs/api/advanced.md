# Advanced API

These APIs are intended for advanced use cases like building development tools, testing utilities, or custom component loaders.

## Lego.snap()

Manually initializes a LegoDOM component element.

```javascript
Lego.snap(element)
```

### Parameters

- `element` (HTMLElement) - The custom element to initialize

### Description

`snap()` performs the following operations on a component element:

1. **Checks if already initialized** - Skips if the element has already been "snapped"
2. **Attaches Shadow DOM** - Creates and attaches a shadow root
3. **Clones template** - Copies the component's template into the shadow root
4. **Applies styles** - Attaches any registered stylesheets via `b-styles`
5. **Merges state** - Combines SFC logic, template `b-data`, and instance `b-data`
6. **Creates reactive state** - Wraps the state in a Proxy for reactivity
7. **Binds events** - Attaches event listeners from `@click`, `@input`, etc.
8. **Renders** - Processes all directives (`b-show`, `b-for`, etc.)
9. **Calls `mounted()`** - Invokes the component's lifecycle hook

### When to Use

**Common use cases:**

- **Dynamic component creation** - When programmatically creating components outside the normal DOM flow
- **Testing** - Manually initializing components in test environments
- **Development tools** - Building component preview tools (like Lego Studio)
- **Custom loaders** - Implementing alternative component loading strategies

**You typically DON'T need this** - LegoDOM's `MutationObserver` automatically detects and initializes components added to the DOM.

### Example: Dynamic Component Preview

```javascript
// Create a mount point
const container = document.createElement('div');
document.body.appendChild(container);

// Dynamically create and initialize a component
const component = document.createElement('my-component');
container.appendChild(component);

// Manually initialize (needed if container is in Shadow DOM)
Lego.snap(component);
```

### Example: Testing

```javascript
// In a test file
import { Lego } from 'lego-dom';

test('my-component renders correctly', () => {
  const el = document.createElement('my-component');
  document.body.appendChild(el);
  
  // Manually initialize for testing
  Lego.snap(el);
  
  // Now you can test the component
  expect(el.shadowRoot.querySelector('h1').textContent).toBe('Hello');
});
```

### Shadow DOM Considerations

If you're creating components inside a Shadow DOM (like in Lego Studio), you need to:

1. Append the element to the Shadow DOM
2. Call `Lego.snap()` to initialize it

```javascript
// Inside a Shadow DOM component
const mount = this.$element.shadowRoot.getElementById('preview');
const component = document.createElement('user-card');
mount.appendChild(component);
Lego.snap(component); // Required - observer doesn't watch Shadow DOMs
```

---

## Lego.unsnap()

Cleans up and destroys a LegoDOM component.

```javascript
Lego.unsnap(element)
```

### Parameters

- `element` (HTMLElement) - The component element to destroy

### Description

`unsnap()` performs cleanup operations:

1. **Removes from active components** - Unregisters from LegoDOM's tracking
2. **Cleans up event listeners** - Prevents memory leaks
3. **Removes from DOM** - Detaches the element from its parent

### When to Use

- **Programmatic cleanup** - When you need to explicitly destroy a component
- **Memory management** - In long-running apps with many dynamic components
- **Testing teardown** - Cleaning up after tests

### Example: Component Lifecycle Management

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
// Preview component manager
class ComponentPreview {
  showComponent(tagName) {
    // Clean up previous component
    if (this.current) {
      Lego.unsnap(this.current);
    }
    
    // Create and show new component
    this.current = document.createElement(tagName);
    this.container.appendChild(this.current);
    Lego.snap(this.current);
  }
}
```

---

## Best Practices

### ✅ Do

- Use `snap()` when creating components in Shadow DOMs
- Use `snap()` in testing environments for explicit control
- Call `unsnap()` when programmatically removing components
- Check if an element is already initialized before calling `snap()`

### ❌ Don't

- Don't call `snap()` on components in the normal DOM (observer handles it)
- Don't call `snap()` multiple times on the same element
- Don't forget to call `unsnap()` when cleaning up dynamic components
- Don't use these APIs unless you have a specific advanced use case

---

## Related

- [Lego.init()](/api/config#init) - Initialize LegoDOM on a root element
- [Lifecycle Hooks](/api/lifecycle) - Component lifecycle methods
- [Lego Studio](https://github.com/rayattack/legodom/tree/main/lego-studio) - Example usage in a development tool
