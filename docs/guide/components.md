# Components

Learn how to create and use components in Lego.

## What is a Component?

A component is a reusable, self-contained piece of UI with its own template, styles, and logic.


::: warning Note That
`style` tags inside NON SFC components are inside the `<template>` tag. And outside the tag in SFCs.
:::


```html
<template b-id="user-badge">
  <style>
    self {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f0f0f0;
      border-radius: 20px;
    }
    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
  </style>
  
  <img class="avatar" src="[[ avatarUrl ]]" alt="[[ name ]]">
  <span>[[ name ]]</span>
</template>
```

## Creating Components

### Method 1: HTML Templates

Define components directly in your HTML with `<template b-id>`:

```html
<template b-id="hello-world" b-data="{ name: 'Default User' }">
  <h1>Hello [[ name ]]!</h1>
</template>

<!-- Uses the default "Default User" -->
<hello-world></hello-world>

<!-- Overrides the default with "Alice" -->
<hello-world b-data="{ name: 'Alice' }"></hello-world>
```

### Method 2: JavaScript

Use `Lego.define()` for programmatic component creation:

```js
Lego.define('hello-world', `
  <h1>Hello [[ name ]]!</h1>
`, {
  name: 'Alice'
});
```

### Method 3: Single File Components (.lego)

With Vite, use `.lego` files:

```html
<!-- hello-world.lego -->
<template>
  <h1>Hello [[ name ]]!</h1>
</template>

<script>
export default {
  name: 'Alice'
}
</script>
```

## Component State

State is defined in the component's logic object:

```js
{
  // Data properties
  count: 0,
  username: 'Alice',
  items: ['apple', 'banana'],
  
  // Methods
  increment() {
    this.count++;
  },
  
  addItem(item) {
    this.items.push(item);
  }
}
```

Access state in templates using `[[ ]]`:

```html
<p>Count: [[ count ]]</p>
<button @click="increment()">+1</button>
```

## Passing Data

### Via b-data Attribute

```html
<user-card b-data="{ 
  name: 'Bob', 
  email: 'bob@example.com',
  role: 'admin' 
}"></user-card>
```

### Data Merging (The Three Tiers)

LegoDOM uses a sophisticated three-tier merging strategy to initialize component state. This allows you to define defaults at the component level, customize them in templates, and then override them for specific instances.

The priority is as follows (**last one wins**):

1.  **Tier 1: Script Logic** - Data defined in `Lego.define()` or exported from a `.lego` SFC.
2.  **Tier 2: Template Defaults** - Data defined on the `<template b-data="...">` attribute.
3.  **Tier 3: Instance Overrides** - Data defined on the actual component tag `<my-comp b-data="...">`.

### Example of Merging

```html
<!-- 1. Script Logic (Defined in JS) -->
<script>
  Lego.define('user-card', `...`, { role: 'guest', theme: 'light' });
</script>

<!-- 2. Template Defaults (Defined in HTML) -->
<template b-id="user-card" b-data="{ role: 'member', name: 'Anonymous' }">
  ...
</template>

<!-- 3. Instance Overrides -->
<user-card b-data="{ name: 'Alice' }"></user-card>
```

In the example above, the final state for the component will be:
- `role`: `'member'` (Template override beats Script)
- `theme`: `'light'` (Only defined in Script)
- `name`: `'Alice'` (Instance override beats Template)

## Component Communication

### Parent → Child (Props)

Pass data via `b-data`:

```html
<child-component b-data="{ title: parentData.title }"></child-component>
```

### Child → Parent (Events)

Use `$emit()` to dispatch custom events:

```html
<!-- Child component -->
<button @click="$emit('save', { id: 123 })">Save</button>
```

```js
// Parent listens
document.querySelector('child-component')
  .addEventListener('save', (e) => {
    console.log('Saved:', e.detail); // { id: 123 }
  });
```

### Accessing Ancestors

Use `$ancestors()` to get a parent component:

```html
<!-- In nested component -->
<p>App title: [[ $ancestors('app-root').state.title ]]</p>
```

::: warning Read-Only
`$ancestors()` should be used for reading parent state, not mutating it.
:::

## Component Composition

### Nesting Components

```html
<template b-id="app-layout">
  <header>
    <app-header></app-header>
  </header>
  <main>
    <app-sidebar></app-sidebar>
    <app-content></app-content>
  </main>
</template>
```

### Using Slots

Standard Web Components slots work:

```html
<template b-id="card-container">
  <div class="card">
    <slot name="header"></slot>
    <slot></slot>
    <slot name="footer"></slot>
  </div>
</template>

<!-- Usage -->
<card-container>
  <h2 slot="header">Title</h2>
  <p>Main content</p>
  <button slot="footer">Action</button>
</card-container>
```

## Shadow DOM

All components use Shadow DOM for style encapsulation.

### Benefits

✅ **Scoped Styles** - CSS doesn't leak in or out  
✅ **No Naming Conflicts** - ID/class names are isolated  
✅ **Composability** - Components work without side effects

### Styling the Host

Use `self` keyword (converts to `:host`):

```html
<style>
  self {
    display: block;
    padding: 1rem;
  }
  
  self:hover {
    background: #f5f5f5;
  }
</style>
```

## Lifecycle

Components have three lifecycle hooks:

```js
{
  mounted() {
    // Component added to DOM
    this.fetchData();
  },
  
  updated() {
    // State changed and re-rendered
    console.log('New count:', this.count);
  },
  
  unmounted() {
    // Component removed from DOM
    clearInterval(this.timer);
  }
}
```

See [Lifecycle Hooks](/guide/lifecycle) for details.

## Best Practices

### 1. Keep Components Small

Each component should have a single responsibility.

✅ Good: `user-avatar`, `user-name`, `user-bio`  
❌ Bad: `entire-user-profile-page`

### 2. Use Semantic Names

Name components after what they represent:

✅ Good: `product-card`, `search-bar`  
❌ Bad: `blue-box`, `flex-container`

### 3. Avoid Deep Nesting

Keep component trees shallow (3-4 levels max):

```html
app-root
  ├── app-header
  │   └── nav-menu
  ├── app-main
  │   └── content-area
  └── app-footer
```

### 4. Initialize State in mounted()

Fetch data or set up timers in `mounted()`:

```js
{
  data: null,
  mounted() {
    this.fetchData();
  },
  async fetchData() {
    this.data = await fetch('/api/data').then(r => r.json());
  }
}
```

### 5. Clean Up in unmounted()

Clear timers, remove listeners:

```js
{
  timer: null,
  mounted() {
    this.timer = setInterval(() => this.tick(), 1000);
  },
  unmounted() {
    clearInterval(this.timer);
  }
}
```

## Common Patterns

### Loading States

```html
<div b-show="loading">Loading...</div>
<div b-show="!loading && data">
  <h2>[[ data.title ]]</h2>
  <p>[[ data.content ]]</p>
</div>
<div b-show="!loading && error">
  Error: [[ error ]]
</div>
```

### Form Components

```js
{
  form: {
    username: '',
    email: '',
    password: ''
  },
  errors: {},
  
  validate() {
    this.errors = {};
    if (!this.form.username) {
      this.errors.username = 'Required';
    }
    if (!this.form.email.includes('@')) {
      this.errors.email = 'Invalid email';
    }
    return Object.keys(this.errors).length === 0;
  },
  
  submit() {
    if (this.validate()) {
      // Submit form
    }
  }
}
```

### Computed Values

Use methods for computed values:

```js
{
  items: [
    { name: 'Apple', price: 1.20 },
    { name: 'Banana', price: 0.80 }
  ],
  
  total() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
}
```

```html
<p>Total: $[[ total().toFixed(2) ]]</p>
```

## Next Steps

- Learn about [Reactivity](/guide/reactivity) in depth
- Explore [Templating](/guide/templating) features
- See [complete examples](/examples/)
