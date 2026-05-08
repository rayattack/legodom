# Slots & Content Projection

Slots let you pass content into a block from the outside, just like React's `children` or Svelte's `<slot>`. LegoDOM uses **native Shadow DOM slots**, there's no custom API to learn.

::: tip Coming from React or Svelte?
| React | Svelte | LegoDOM |
|-------|--------|---------|
| `props.children` | `<slot />` | `<slot></slot>` |
| Named: `props.header` | `<slot name="header" />` | `<slot name="header"></slot>` |
| Default content: `children \|\| <Fallback />` | `<slot>Fallback</slot>` | `<slot>Fallback</slot>` |
:::

## How Slots Work

Every LegoDOM block uses Shadow DOM. When you place child elements inside a block tag, they live in the **Light DOM**. The browser automatically projects them into matching `<slot>` elements inside the block's Shadow DOM template.

```
Light DOM (what you write)          Shadow DOM (block template)
┌─────────────────────────┐        ┌─────────────────────────┐
│ <my-card>               │        │ <div class="card">      │
│   <p>Hello!</p>  ──────────────►│   <slot></slot>         │
│ </my-card>              │        │ </div>                  │
└─────────────────────────┘        └─────────────────────────┘
```

## Default Slot

The simplest slot, captures all child content that doesn't have a `slot` attribute.

**Define the block:**

```html
<template b-id="info-card">
  <style>
    self { display: block; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
  </style>
  <div class="card">
    <slot></slot>
  </div>
</template>
```

**Use it:**

```html
<info-card>
  <h3>Important Notice</h3>
  <p>This content gets projected into the slot.</p>
</info-card>
```

### Fallback Content

Provide default content that shows when nothing is passed:

```html
<template b-id="user-greeting">
  <slot>
    <p>No user content provided.</p>
  </slot>
</template>

<!-- With content: shows "Welcome back!" -->
<user-greeting>
  <p>Welcome back!</p>
</user-greeting>

<!-- Without content: shows "No user content provided." -->
<user-greeting></user-greeting>
```

## Named Slots

Target specific areas of a layout by naming your slots.

**Define the block:**

```html
<template b-id="page-layout">
  <style>
    self { display: block; }
    header { background: #333; color: white; padding: 1rem; }
    main { padding: 2rem; }
    footer { background: #f5f5f5; padding: 1rem; text-align: center; }
  </style>

  <header>
    <slot name="header"></slot>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>
    <slot name="footer">Default footer text</slot>
  </footer>
</template>
```

**Use it:**

```html
<page-layout>
  <h1 slot="header">My App</h1>

  <!-- No slot attribute = goes into the default slot -->
  <p>This is the main content area.</p>
  <p>Multiple elements can go into the default slot.</p>

  <span slot="footer">Copyright 2025</span>
</page-layout>
```

**Result:** The `<h1>` renders in the header, the two `<p>` tags render in the main area, and the `<span>` renders in the footer.

## Practical Patterns

### Card Component

A reusable card with header, body, and actions:

```html
<template b-id="ui-card">
  <style>
    self { display: block; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    .header { padding: 1rem; border-bottom: 1px solid #e0e0e0; font-weight: 600; }
    .body { padding: 1rem; }
    .actions { padding: 0.75rem 1rem; background: #fafafa; border-top: 1px solid #e0e0e0; display: flex; gap: 0.5rem; justify-content: flex-end; }
  </style>

  <div class="header"><slot name="header">Card</slot></div>
  <div class="body"><slot></slot></div>
  <div class="actions"><slot name="actions"></slot></div>
</template>
```

```html
<ui-card>
  <span slot="header">User Profile</span>
  <p>Name: Alice</p>
  <p>Email: alice@example.com</p>
  <button slot="actions">Edit</button>
  <button slot="actions">Delete</button>
</ui-card>
```

### Modal Wrapper

A modal that wraps any content:

```html
<template b-id="modal-overlay">
  <style>
    self { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%; }
  </style>

  <div class="modal">
    <slot></slot>
  </div>
</template>
```

```html
<modal-overlay b-show="showModal">
  <h2>Confirm Action</h2>
  <p>Are you sure you want to delete this item?</p>
  <button @click="deleteItem()">Yes, Delete</button>
  <button @click="showModal = false">Cancel</button>
</modal-overlay>
```

### App Shell with Router

The most common layout pattern, a persistent shell with a routed content area:

```html
<template b-id="app-shell">
  <style>
    self { display: flex; min-height: 100vh; }
    nav { width: 250px; background: #1a1a2e; color: white; padding: 1rem; }
    main { flex: 1; padding: 2rem; }
  </style>

  <nav>
    <h2>My App</h2>
    <a href="/" b-link>Home</a>
    <a href="/settings" b-link>Settings</a>
  </nav>
  <main>
    <slot></slot>
  </main>
</template>
```

```html
<!-- index.html -->
<app-shell>
  <lego-router></lego-router>
</app-shell>
```

The router swaps pages inside the shell while the sidebar stays persistent. See [Layouts & Composition](/guide/layouts) for more patterns.

## Important: Light DOM vs Shadow DOM

Slotted content lives in the **Light DOM**, not inside the block's Shadow DOM. This has CSS implications:

- **Block styles do NOT apply** to slotted content by default
- To style slotted content from inside the block, use the `::slotted()` pseudo-element
- Global (page-level) styles DO apply to slotted content

```html
<template b-id="styled-box">
  <style>
    /* This styles elements INSIDE the shadow DOM */
    .wrapper { border: 2px solid blue; padding: 1rem; }

    /* This styles slotted (Light DOM) content from inside the block */
    ::slotted(p) { color: blue; }

    /* This does NOT work, can only target direct children */
    /* ::slotted(p span) { ... } */
  </style>

  <div class="wrapper">
    <slot></slot>
  </div>
</template>
```

::: warning ::slotted() Limitations
The `::slotted()` selector can only target **direct children** of the host element. It cannot target nested elements. For example, `::slotted(p)` works but `::slotted(p span)` does not. This is a browser limitation, not a LegoDOM limitation.
:::

## Slots with Blocks (Not Just HTML)

You can slot entire LegoDOM blocks, not just plain HTML:

```html
<dashboard-layout>
  <user-profile slot="header"></user-profile>
  <nav-menu slot="sidebar"></nav-menu>
  <lego-router slot="content"></lego-router>
</dashboard-layout>
```

Each slotted block maintains its own Shadow DOM, state, and lifecycle, fully encapsulated.

## Next Steps

- See [Layouts & Composition](/guide/layouts) for layout patterns with slots
- Learn about [Blocks](/guide/blocks) for block creation
- Explore [Error Handling](/guide/error-handling) for error boundaries
