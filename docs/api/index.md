# API Reference

Complete API reference for LegoJS.

## Lego.define()

Define a component programmatically.

### Signature

```ts
Lego.define(
  tagName: string,
  templateHTML: string, 
  logic?: object
): void
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tagName` | `string` | Component name (must be kebab-case with hyphen) |
| `templateHTML` | `string` | HTML template with optional `<style>` |
| `logic` | `object` | Reactive state and methods (optional) |

### Example

```js
Lego.define('user-card', `
  <style>
    self { padding: 1rem; border: 1px solid #ddd; }
  </style>
  <h2>{{ name }}</h2>
  <p>{{ bio }}</p>
  <button @click="sayHello()">Greet</button>
`, {
  name: 'John Doe',
  bio: 'Developer',
  sayHello() {
    alert(`Hello from ${this.name}!`);
  }
});
```

---

## Lego.route()

Define a client-side route.

### Signature

```ts
Lego.route(
  path: string,
  tagName: string,
  middleware?: Function
): void
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | URL pattern (supports `:param` for dynamic segments) |
| `tagName` | `string` | Component to render for this route |
| `middleware` | `function` | Optional middleware function for guards/logging |

### Example

```js
// Simple route
Lego.route('/', 'home-page');

// Dynamic route
Lego.route('/user/:id', 'user-profile');

// With middleware
Lego.route('/admin', 'admin-panel', (params, globals) => {
  if (!globals.isAdmin) {
    history.pushState({}, '', '/');
    return false; // Block navigation
  }
  return true; // Allow navigation
});
```

---

## Lego.globals

Global reactive state accessible from all components.

### Type

```ts
Lego.globals: ProxyObject
```

### Usage

```js
// Set global state
Lego.globals.user = { name: 'Alice', role: 'admin' };
Lego.globals.isAuthenticated = true;

// Access in component template
<p b-if="global.isAuthenticated">Welcome {{ global.user.name }}!</p>

// Access in component logic
{
  checkAuth() {
    if (Lego.globals.isAuthenticated) {
      console.log('User is logged in');
    }
  }
}
```

### Route Parameters

When using the router, `Lego.globals.params` contains route parameters:

```js
// Route: /user/:id
// URL: /user/123

Lego.globals.params.id // => '123'
```

---

## Directives

Special attributes for common patterns.

### `b-data`

Initialize component state.

```html
<my-component b-data="{ count: 0, name: 'Alice' }"></my-component>
```

### `b-if`

Conditional rendering (uses `display: none`).

```html
<p b-if="isLoggedIn">Welcome back!</p>
<p b-if="!isLoggedIn">Please log in</p>
```

### `b-for`

List rendering.

```html
<ul>
  <li b-for="item in items">{{ item.name }} - ${{ item.price }}</li>
</ul>
```

Access index (implicit):

```html
<li b-for="item in items">
  Item #{{ $index }}: {{ item.name }}
</li>
```

### `b-sync`

Two-way data binding.

```html
<!-- Text input -->
<input b-sync="username" />

<!-- Checkbox -->
<input type="checkbox" b-sync="agreed" />

<!-- In b-for loops -->
<li b-for="todo in todos">
  <input type="checkbox" b-sync="todo.done" />
  {{ todo.text }}
</li>
```

### `b-link`

Prevents default anchor behavior for client-side routing.

```html
<a href="/about" b-link>About</a>
```

### `@event`

Event listeners.

```html
<!-- Click -->
<button @click="handleClick()">Click Me</button>

<!-- Input -->
<input @input="handleInput()" />

<!-- Submit -->
<form @submit="handleSubmit(event)">...</form>

<!-- Any DOM event -->
<div @mouseenter="onHover()" @mouseleave="onLeave()">Hover me</div>
```

Access event object:

```html
<button @click="handleClick(event)">Click</button>
```

```js
{
  handleClick(event) {
    console.log('Button clicked:', event.target);
    event.preventDefault();
  }
}
```

---

## Templating

### Interpolation

```html
<!-- Simple value -->
<p>{{ message }}</p>

<!-- Expression -->
<p>{{ count * 2 }}</p>

<!-- Method call -->
<p>{{ formatDate(timestamp) }}</p>

<!-- Conditional -->
<p>{{ age >= 18 ? 'Adult' : 'Minor' }}</p>

<!-- In attributes -->
<img src="/avatars/{{ userId }}.png" alt="{{ username }}">
<div class="status-{{ status }}">{{ status }}</div>
```

### Special Keywords

- `self` - References `this` keyword in component scope
- `event` - Available in `@event` handlers
- `global` - Access `Lego.globals`

---

## Lifecycle Hooks

Define lifecycle methods in component logic.

### `mounted()`

Called after component is added to the DOM.

```js
{
  mounted() {
    console.log('Component mounted!');
    this.fetchData();
  }
}
```

### `updated()`

Called after component state changes and re-render completes.

```js
{
  count: 0,
  updated() {
    console.log('Count is now:', this.count);
  }
}
```

### `unmounted()`

Called when component is removed from the DOM.

```js
{
  timer: null,
  mounted() {
    this.timer = setInterval(() => this.tick(), 1000);
  },
  unmounted() {
    clearInterval(this.timer);
    console.log('Cleanup complete');
  }
}
```

---

## Helper Functions

### `$emit(name, detail)`

Dispatch a custom event from a component.

```html
<button @click="$emit('save', { id: item.id })">Save</button>
```

Listen from parent:

```html
<child-component></child-component>

<script>
  document.querySelector('child-component')
    .addEventListener('save', (e) => {
      console.log('Saved:', e.detail);
    });
</script>
```

### `$ancestors(tagName)`

Access state from nearest ancestor component.

```html
<!-- In deeply nested component -->
<p>App title: {{ $ancestors('app-shell').title }}</p>
```

::: warning Read-Only
`$ancestors()` is intended for reading parent state, not mutating it. Changes won't be reactive.
:::

### `$registry(tagName)`

Access shared singleton state for a component type.

```js
// Define shared state
Lego.define('config-provider', '<div></div>', {
  apiUrl: 'https://api.example.com',
  theme: 'dark'
});

// Access from any component
{
  mounted() {
    const config = this.$registry('config-provider');
    console.log('API:', config.apiUrl);
  }
}
```

---

## Shadow DOM

### Styling

Use the `self` keyword to target the component root:

```html
<style>
  self {
    display: block;
    padding: 1rem;
  }
</style>
```

Compiles to `:host`:

```css
:host {
  display: block;
  padding: 1rem;
}
```

### Slots

LegoJS supports standard slot syntax:

```html
<!-- Component definition -->
<template b-id="card-wrapper">
  <style>
    self { border: 1px solid #ddd; padding: 1rem; }
    ::slotted(h1) { color: blue; }
  </style>
  
  <slot></slot>
</template>

<!-- Usage -->
<card-wrapper>
  <h1>This content goes in the slot</h1>
  <p>And this too!</p>
</card-wrapper>
```

Named slots:

```html
<template b-id="layout">
  <header>
    <slot name="header"></slot>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>
    <slot name="footer"></slot>
  </footer>
</template>

<!-- Usage -->
<layout>
  <div slot="header">Header Content</div>
  <div>Main Content</div>
  <div slot="footer">Footer Content</div>
</layout>
```

---

## Type Definitions

LegoJS includes JSDoc type annotations for IDE autocomplete.

```js
/**
 * @typedef {Object} ComponentState
 * @property {Function} [mounted] - Lifecycle hook
 * @property {Function} [updated] - Lifecycle hook  
 * @property {Function} [unmounted] - Lifecycle hook
 */

/**
 * @param {string} tagName
 * @param {string} templateHTML
 * @param {ComponentState} [logic]
 */
Lego.define(tagName, templateHTML, logic);
```

---

## Browser Support

Requires:
- Web Components (Custom Elements v1)
- Shadow DOM v1
- ES6 Proxy
- Template Literals
- MutationObserver

Supported browsers:
- Chrome 63+
- Firefox 63+
- Safari 11.1+
- Edge 79+

---

## Next Steps

- See [complete examples](/examples/)
- Read [best practices guide](/guide/best-practices)
- Explore [advanced patterns](/guide/advanced)
