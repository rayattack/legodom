---
layout: home

hero:
  name: LegoDOM
  text: Reactive Web Components
  tagline: A tiny, zero-dependency UI library powered by reactive Web Components
  image:
    src: /logo.svg
    alt: LegoDOM
  actions:
    - theme: brand
      text: Get Started
      link: /tutorial/index
    - theme: alt
      text: View on GitHub
      link: https://github.com/rayattack/LegoDOM
    - theme: alt
      text: Try Examples
      link: /examples/

features:
  - icon: 🔄
    title: Universal Portability
    details: Blocks are just HTML. Render them on the server, load them in a SPA, or inject them dynamically. They work everywhere.
  
  - icon: 🧩
    title: Automatic "Snap"
    details: The "Snap" engine detects blocks and attaches logic instantly. No complex hydration or prop-drilling required.
  
  - icon: ⚡
    title: Radical Simplicity
    details: Learn the entire API in an afternoon. No build step, no VDOM, no magic compilers (unless you want them).
  
  - icon: 🛡️
    title: Native Power
    details: Built on true Web Standards—Custom Elements and Shadow DOM. Your code is future-proof and encapsulated by default.
  
  - icon: 📦
    title: Zero-Dependency Runtime
    details: One small build artifact. Includes router, persistence, and reactivity. No peer dependencies at runtime.
  
  - icon: 🧱
    title: Framework Agnostic
    details: Since blocks are native elements, they work inside React, Vue, Svelte, or vanilla HTML without adapters.
---

## Blocks & Naming

How you name your blocks depends on how you use LegoDOM:

### 1. Vite / Build Tools (Recommended)
**Convention over Configuration.** The filename *is* the tag name.
- `user-card.lego` → `<user-card></user-card>`
- `app-nav.lego` → `<app-nav></app-nav>`

You do not need `b-id` inside `.lego` files; the build system handles registration automatically.

### 2. CDN / Script Tags
Since there are no files, you must explicitly name your blocks using the `b-id` attribute on the `<template>` tag.

```html
<!-- Only needed for CDN usage -->
<template b-id="user-profile">
  <h1>User Profile</h1>
</template>
```

## Quick Start (CDN)

```html
<!-- Define a block -->
<template b-id="counter-button" b-logic="{
  title: 'My counter',
  count: 0
}">
  <style>
    self {
      display: block;
      padding: 1rem;
    }
    button {
      font-size: 1.2rem;
      padding: 0.5rem 1rem;
    }
  </style>
  
  <h2>[[ title ]]</h2>
  <button @click="count++">
    Clicked [[ count ]] times
  </button>
</template>

<!-- Use it -->
<counter-button b-logic="{ title: 'Override b-logic title' }"></counter-button>

<script src="https://unpkg.com/lego-dom"></script>
<script>
  // Complete the initialization
  Lego.init();
</script>
```

That's it. No build step, no npm, no configuration.

> [!IMPORTANT]
> **Why call `Lego.init()`?**
> While `Lego.block()` (or simple templates) will "snap" your blocks into the page immediately, you must call `Lego.init()` to start the background engine. Without it:
> - **Reactivity** to data changes won't work.
> - **Mustaches** (`[[...]]`) outside of blocks won't hydrate.
> - **Single Page Routing** won't be activated.
> - **New blocks** added to the DOM dynamically won't be auto-initialized.

## Why LegoDOM?

**For small projects**, you get reactive blocks without the overhead of a full framework.

**For large projects**, you get a clear mental model and Web Standards compliance.

**For learning**, you can read the entire source code in an afternoon and understand exactly how it works.

## Comparison

| Feature | LegoDOM | Vue | React |
|---------|--------|-----|-------|
| Build required | Optional | Yes | Yes |
| Virtual DOM | No | Yes | Yes |
| Reactivity | ES6 `Proxy` | `ref` / `reactive` | `useState` |
| Web Components | Native | Optional | No |
| Templating | `[[ … ]]` in real DOM | template / JSX | JSX |

The Vite plugin is optional — it's only needed if you want `.lego` Single File Blocks. CDN usage works with no build at all.

## Browser Support

LegoDOM relies on Custom Elements v1, Shadow DOM v1, ES6 `Proxy`, `IntersectionObserver` (only consumed by `b-enter` / `b-leave`), and constructable stylesheets (only used by `b-stylesheets`).

Tested in Chrome 90+, Firefox 90+, Safari 15+, and Edge 90+.

## Community
- 💬 [Discussions](https://github.com/rayattack/LegoDOM/discussions)
- 🐛 [Issue Tracker](https://github.com/rayattack/LegoDOM/issues)
- 📦 [npm Package](https://www.npmjs.com/package/lego-dom)
