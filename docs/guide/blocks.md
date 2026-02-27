# 'B' is for Blocks

Learn how to create and use blocks in LegoDOM.

## What is a Block?

A block is a reusable, self-contained piece of UI with its own template, styles, and logic. In other frameworks (and previous versions of LegoDOM), these are called "components". We call them Blocks because you use them to build your application.

::: warning Note That
`style` tags outside Lego Files are inside the `<template>` tag. And outside the tag i.e. on the same level as the `<template>` tag in Lego Files.
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

## Creating Blocks

### Method 1: HTML Templates

Define blocks directly in your HTML with `<template b-id>`:

```html
<template b-id="hello-world" b-logic="{ name: 'Default User' }">
  <h1>Hello [[ name ]]!</h1>
</template>

<!-- Uses the default "Default User" -->
<hello-world></hello-world>

> **Note:** Once initialized, the block will automatically receive a `b-id="hello-world"` attribute. This is useful for [preventing FOUC](/guide/faq#how-do-i-prevent-flash-of-unstyled-content-fouc).

<!-- Overrides the default with "Alice" -->
<hello-world b-logic="{ name: 'Alice' }"></hello-world>
```

### Method 2: JavaScript

Use `Lego.block()` for programmatic block creation:

```js
Lego.block('hello-world', `
  <h1>Hello [[ name ]]!</h1>
`, {
  name: 'Alice'
});
```

### Method 3: Lego Files / Single File Blocks (.lego)

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

## Block State (Logic)

State is defined in the block's logic object via the `b-logic` attribute:

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

### Via b-logic Attribute

```html
<user-card b-logic="{ 
  name: 'Bob', 
  email: 'bob@example.com',
  role: 'admin' 
}"></user-card>
```

### Data Merging (The Three Tiers)

LegoDOM uses a sophisticated three-tier merging strategy to initialize block state. This allows you to define defaults at the block level, customize them in templates, and then override them for specific instances.

The priority is as follows (**last one wins**):

1.  **Tier 1: Script Logic** - Data defined in `Lego.block()` or exported from a `.lego` file.
2.  **Tier 2: Template Defaults** - Data defined on the `<template b-logic="...">` attribute.
3.  **Tier 3: Instance Overrides** - Data defined on the actual block tag `<my-comp b-logic="...">`.

### Example of Merging

```html
<!-- 1. Script Logic (Defined in JS) -->
<script>
  // Lego.block is an alias for Lego.block
  Lego.block('user-card', `...`, { role: 'guest', theme: 'light' });
</script>

<!-- 2. Template Defaults (Defined in HTML) -->
<template b-id="user-card" b-logic="{ role: 'member', name: 'Anonymous' }">
  ...
</template>

<!-- 3. Instance Overrides -->
<user-card b-logic="{ name: 'Alice' }"></user-card>
```

In the example above, the final state for the block will be:
- `role`: `'member'` (Template override beats Script)
- `theme`: `'light'` (Only defined in Script)
- `name`: `'Alice'` (Instance override beats Template)

## Block Communication

### Parent → Child (Scoped Props)

Pass data via `b-logic` naturally. The evaluation context includes the **parent block's state**, effectively making `b-logic` behave like "scoped props".

```html
<!-- `user` comes from the parent's state! -->
<child-block b-logic="{ user: user }"></child-block>
```

Variables inside `b-logic` are resolved in this order:
1.  **Parent Block State**: (e.g. `this.user`)
2.  **Global Scope**: (e.g. `window.user`, `global.xxx`)

### Accessing Parent (`$parent`)

For tighter coupling, you can access the immediate block ancestor using `$parent`:

**In Template:**
```html
<span>Parent is: [[ $parent.tagName ]]</span>
```

**In Script:**
```javascript
mounted() {
  console.log(this.$parent); // Returns parent Block element (or undefined)
}
```

> [!NOTE]
> `$parent` automatically skips non-block elements (like `<div>` wrappers) to find the nearest *Lego Block* ancestor.

### Child → Parent (Events)

Use `$emit()` to dispatch custom events:

```html
<!-- Child block -->
<button @click="$emit('save', { id: 123 })">Save</button>
```

```js
// Parent listens
document.querySelector('child-block')
  .addEventListener('save', (e) => {
    console.log('Saved:', e.detail); // { id: 123 }
  });
```

### Accessing Ancestors

Use `$ancestors()` to get a parent block:

```html
<!-- In nested block -->
<p>App title: [[ $ancestors('app-root').state.title ]]</p>
```

::: warning Read-Only
`$ancestors()` should be used for reading parent state, not mutating it.
:::

## Block Composition

### Nesting Blocks

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

All blocks use Shadow DOM for style encapsulation.

### Benefits

✅ **Scoped Styles** - CSS doesn't leak in or out  
✅ **No Naming Conflicts** - ID/class names are isolated  
✅ **Composability** - Blocks work without side effects

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

Blocks have three lifecycle hooks:

```js
{
  mounted() {
    // Block added to DOM
    this.fetchData();
  },
  
  updated() {
    // State changed and re-rendered
    console.log('New count:', this.count);
  },
  
  unmounted() {
    // Block removed from DOM
    clearInterval(this.timer);
  }
}
```

See [Lifecycle Hooks](/guide/lifecycle) for details.

## Best Practices

### 1. Keep Blocks Small

Each block should have a single responsibility.

✅ Good: `user-avatar`, `user-name`, `user-bio`  
❌ Bad: `entire-user-profile-page`

### 2. Use Semantic Names

Name blocks after what they represent:

✅ Good: `product-card`, `search-bar`  
❌ Bad: `blue-box`, `flex-container`

### 3. Avoid Deep Nesting

Keep block trees shallow (3-4 levels max):

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

## Next Steps

- Learn about [Reactivity](/guide/reactivity) in depth
- Explore [Templating](/guide/templating) features
- See [complete examples](/examples/)
