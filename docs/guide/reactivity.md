# Reactivity

Understand how Lego makes your UI automatically update when data changes.

## The Core Concept

When you change an object, the DOM updates automatically:

```js
block.state.count = 5;  // DOM updates!
block.state.items.push('new item');  // DOM updates
```

No `setState()`, no `dispatch()`, no special syntax. Just mutate the data.

## How It Works

Lego uses **ES6 Proxies** to track changes:

```js
const reactive = (obj, el) => {
  return new Proxy(obj, {
    // ...
  });
};
```

When you set a property, the proxy intercepts it and schedules a re-render.

## Surgical Updates

LegoDOM uses **scoped rendering**—only the block whose state changed gets re-rendered.

```
┌─────────────────────────────────────────────┐
│  1000 Blocks on Page                        │
│                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │     │ │     │ │ ✏️  │ │     │ │     │   │
│  └─────┘ └─────┘ └──┬──┘ └─────┘ └─────┘   │
│                     │                       │
│              state.count++                  │
│                     │                       │
│                     ▼                       │
│              Only THIS block                │
│              re-renders (1/1000)            │
└─────────────────────────────────────────────┘
```

### Why It Works This Way

Each block's state is wrapped in its own Proxy, bound to that specific element:

```js
// Internally, LegoDOM does this:
el._studs = reactive(stateObject, el);  // Proxy is bound to THIS element
```

When you mutate `this.count`, the Proxy's `set` trap only queues **that element** for re-render—not the entire page.

### Performance Implications

| Scenario | Blocks Re-Rendered |
|----------|-------------------|
| Block A's local state changes | 1 (Block A only) |
| `Lego.globals.theme` changes | Only blocks using `[[ global.theme ]]` |
| 1000 blocks, 1 state change | **1 block** ✅ |

### Global State Optimization

When you modify `Lego.globals`, LegoDOM doesn't blindly re-render everything. It tracks which blocks have a **global dependency** (i.e., they reference `global.*` in their template) and only updates those:

```js
Lego.globals.theme = 'dark';  // Only blocks with [[ global.* ]] bindings update
```

This gives you application-wide state without application-wide re-renders.

## What's Reactive

### ✅ Direct Property Assignment

```js
this.count = 10;              // ✅ Reactive
this.user.name = 'Alice';     // ✅ Reactive
this.items[0] = 'updated';    // ✅ Reactive
```

### ✅ Array Methods

```js
this.items.push('new');       // ✅ Reactive
this.items.pop();             // ✅ Reactive
this.items.splice(0, 1);      // ✅ Reactive
this.items.sort();            // ✅ Reactive
```

### ✅ Nested Objects

```js
this.user.profile.age = 30;   // ✅ Reactive
```

Lego recursively wraps nested objects in proxies.

### ✅ Object Deletion

```js
delete this.user.email;       // ✅ Reactive
```

### 💡 Best Practice: Initialize Properties Upfront

While adding new properties at runtime IS reactive, it's still good practice to initialize all properties in your initial state for clarity and maintainability:

```js
{
  count: 0,
  newProp: null  // ✅ Explicitly declared, easy to see what state exists
}
```

This makes your block's "shape" clear to other developers and avoids runtime surprises.

## Batching Updates

Lego batches updates using `requestAnimationFrame`:

```js
this.count = 1;
this.count = 2;
this.count = 3;
// Only one re-render happens!
```

This prevents unnecessary DOM updates and improves performance.

## Update Lifecycle

1. **State Change** - You mutate data
2. **Proxy Intercepts** - Change is detected
3. **Batch Queue** - Block added to update queue
4. **requestAnimationFrame** - Browser schedules render
5. **Re-render** - DOM is updated
6. **updated() Hook** - Called after render

```js
{
  count: 0,
  
  increment() {
    console.log('Before:', this.count);
    this.count++;
    console.log('After:', this.count);
    // DOM not updated yet!
  },
  
  updated() {
    console.log('DOM updated with:', this.count);
  }
}
```

## Global Reactivity

Lego also supports **Global State** available to all blocks and the main document.

```js
// src/main.js
Lego.globals.isLoggedIn = true;
```

For global state to automatically update mustaches in your `index.html`, you must initialize the engine:

```js
// Enables global reactivity and the MutationObserver
Lego.init();
```

Inside any block, you can access global state via `global`:

```html
<p b-show="global.isLoggedIn">Welcome!</p>
```

## Deep Reactivity

Nested objects are automatically reactive:

```js
{
  user: {
    profile: {
      settings: {
        theme: 'dark'
      }
    }
  }
}
```

```html
<!-- All reactive -->
<p>[[ user.profile.settings.theme ]]</p>
```

```js
this.user.profile.settings.theme = 'light';  // ✅ Updates DOM
```

## Arrays and Objects

### Array Mutations

All mutating methods trigger updates:

```js
this.items.push(newItem);
this.items.pop();
this.items.shift();
this.items.unshift(item);
this.items.splice(index, 1);
this.items.sort();
this.items.reverse();
```

### Non-Mutating Methods

These don't trigger updates (they return new arrays):

```js
const filtered = this.items.filter(x => x.active);  // No update
const mapped = this.items.map(x => x.name);         // No update
```

To make them reactive, assign back:

```js
this.items = this.items.filter(x => x.active);  // ✅ Triggers update
```

Or use mutating equivalents:

```js
// Instead of filter
for (let i = this.items.length - 1; i >= 0; i--) {
  if (!this.items[i].active) {
    this.items.splice(i, 1);  // ✅ Reactive
  }
}
```

## Object Changes

### Adding Properties to Nested Objects

```js
this.user.newProp = 'value';  // ✅ Reactive (nested object)
```

### Object.assign()

```js
Object.assign(this.user, { name: 'Alice', age: 30 });  // ✅ Reactive
```

## Performance Considerations

### Multiple Mutations Are Already Batched

LegoDOM's batcher uses a `Set` to track blocks, so multiple mutations in the same tick result in **one re-render**:

```js
this.user.name = 'Alice';
this.user.age = 30;
this.user.email = 'alice@example.com';
// ✅ Only one re-render! The batcher deduplicates.
```

`Object.assign` is fine for readability, but not required for performance:

```js
Object.assign(this.user, {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});
// Also one re-render - same result
```

### Constants Are Fine in State

All properties on state are reactive—but constants never change, so it doesn't matter:

```js
{
  count: 0,              // Mutable - reactivity matters
  MAX_COUNT: 100,        // Immutable by convention - reactivity doesn't hurt anything
  API_URL: '/api/v1'     // Same - just never mutate it
}
```

There's no performance penalty for including constants in your state.

## Debugging Reactivity

### Check if Value Changed

```js
{
  count: 0,
  
  updated() {
    console.log('Count changed to:', this.count);
  }
}
```

### Inspect Proxy

```js
console.log(block.state);  // Proxy object
console.log(block.state.count);  // Actual value
```

## Comparing with Other Frameworks

### Vue 3

```js
// Vue 3
const count = ref(0);
count.value++;

// Lego
this.count++;
```

### React

```js
// React
const [count, setCount] = useState(0);
setCount(count + 1);

// Lego
this.count++;
```

### Svelte

```js
// Svelte
let count = 0;
count++;

// Lego
this.count++;
```

Lego is closest to Svelte's model but uses Proxies instead of compilation.

## Advanced Patterns

### Watching for Changes

Use `updated()` hook:

```js
{
  count: 0,
  previousCount: 0,
  
  updated() {
    if (this.count !== this.previousCount) {
      console.log('Count changed from', this.previousCount, 'to', this.count);
      this.previousCount = this.count;
    }
  }
}
```

### Computed Properties

Use methods:

```js
{
  firstName: 'John',
  lastName: 'Doe',
  
  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}
```

```html
<p>[[ fullName() ]]</p>
```

### Debouncing Updates

```js
{
  searchQuery: '',
  timer: null,
  
  onInput() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.performSearch();
    }, 300);
  }
}
```

## Best Practices

1. **Initialize all properties** - Makes your block's shape clear to other developers
2. **Use array mutating methods** - `push()`, `splice()`, etc. trigger updates
3. **Use methods for computed values** - They're recalculated on every render

## Next Steps

- Learn about [Templating](/guide/templating)
- Explore [Directives](/guide/directives)
- See [reactivity examples](/examples/)
