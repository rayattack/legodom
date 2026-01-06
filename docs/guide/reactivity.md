# Reactivity

Understand how Lego makes your UI automatically update when data changes.

## The Core Concept

When you change an object, the DOM updates automatically:

```js
component._studs.count = 5;  // DOM updates!
component._studs.items.push('new item');  // DOM updates!
```

No `setState()`, no `dispatch()`, no special syntax. Just mutate the data.

## How It Works

Lego uses **ES6 Proxies** to track changes:

```js
const reactive = (obj, el) => {
  return new Proxy(obj, {
    set(target, key, value) {
      const oldValue = target[key];
      target[key] = value;
      
      if (oldValue !== value) {
        // Schedule re-render
        render(el);
      }
      
      return true;
    }
  });
};
```

When you set a property, the proxy intercepts it and schedules a re-render.

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

### ⚠️ Limitations

#### Replacing Arrays

Don't replace the entire array reference:

```js
this.items = newItems; // ⚠️ Might not be reactive
```

Instead, mutate in place:

```js
this.items.length = 0;
this.items.push(...newItems);  // ✅ Better
```

#### Adding New Root Properties

Adding properties after initialization won't be reactive:

```js
// Initial state
{
  count: 0
}

// Later...
this.newProp = 'value';  // ⚠️ Not reactive
```

Initialize all properties upfront:

```js
{
  count: 0,
  newProp: null  // ✅ Initialize with default
}
```

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
3. **Batch Queue** - Component added to update queue
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
    // DOM is updated now!
  }
}
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
<p>{{ user.profile.settings.theme }}</p>
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

### Minimize Unnecessary Updates

Group related changes:

```js
// ❌ Bad - 3 separate updates
this.user.name = 'Alice';
this.user.age = 30;
this.user.email = 'alice@example.com';

// ✅ Better - 1 update
Object.assign(this.user, {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com'
});
```

### Avoid Reactive Overhead for Static Data

Don't make everything reactive:

```js
{
  // Reactive data
  count: 0,
  
  // Constants (not reactive, but that's fine)
  MAX_COUNT: 100,
  API_URL: 'https://api.example.com'
}
```

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
console.log(component._studs);  // Proxy object
console.log(component._studs.count);  // Actual value
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
<p>{{ fullName() }}</p>
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

1. **Initialize all properties** - Define them upfront
2. **Use array methods** - push(), splice(), etc.
3. **Batch related changes** - Use Object.assign()
4. **Keep state flat when possible** - Shallow is faster
5. **Use methods for computed values** - They're called on every render

## Next Steps

- Learn about [Templating](/guide/templating)
- Explore [Directives](/guide/directives)
- See [reactivity examples](/examples/)
