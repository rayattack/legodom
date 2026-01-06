---
layout: home

hero:
  name: LegoDOM
  text: Build Reactive Web Components
  tagline: A tiny, zero-dependency Web library for creating reactive Web Components directly in the browser
  image:
    src: /logo.svg
    alt: Lego
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/rayattack/Lego
    - theme: alt
      text: Try Examples
      link: /examples/

features:
  - icon: 🎯
    title: Mental Model Simplicity
    details: No virtual DOM, no compilation step, no JSX. Just HTML with a few directives and reactive objects.
  
  - icon: ⚡
    title: Zero Dependencies
    details: Under 500 lines of code with no external dependencies. The entire library is smaller than most framework router plugins.
  
  - icon: 🔄
    title: True Reactivity
    details: Direct object mutation triggers updates. No setters, no actions, no reducers. Just change the data and the DOM updates.
  
  - icon: 🧩
    title: Web Components Native
    details: Built on standard Web Components with Shadow DOM. Works anywhere, plays well with existing code.
  
  - icon: 📦
    title: Single File Components
    details: Use .lego files with Vite for a modern development experience, or load directly in the browser.
  
  - icon: 🎨
    title: Scoped Styles
    details: Shadow DOM encapsulation means your styles never leak. Use the 'self' keyword to target component root.
  
  - icon: 🛣️
    title: Built-in Router
    details: Client-side routing included. Define routes, handle parameters, and add middleware without extra packages.
  
  - icon: 💪
    title: TypeScript Ready
    details: Full JSDoc annotations for excellent IDE support and optional TypeScript integration.
  
  - icon: 🚀
    title: Production Ready
    details: Battle-tested patterns from Vue and React, adapted for pure Web Components. No framework lock-in.
---

## Quick Example

```html
<!-- Define a component -->
<template b-id="counter-button" b-data="{
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
  
  <h2>{{ title }}</h2>
  <button @click="count++">
    Clicked {{ count }} times
  </button>
</template>

<!-- Use it -->
<counter-button b-data="{ title: 'Override b-data title' }"></counter-button>

<script src="https://unpkg.com/lego-dom/main.js"></script>
```

That's it. No build step, no npm, no configuration.

## Why Lego?

**For small projects**, you get reactive components without the overhead of a full framework.

**For large projects**, you get a clear mental model and Web Standards compliance.

**For learning**, you can read the entire source code in an afternoon and understand exactly how it works.

## Comparison

| Feature | Lego | Vue | React |
|---------|--------|-----|-------|
| Size | < 17KB | ~33KB | ~40KB |
| Dependencies | 0 | Many | Many |
| Build Required | No* | Yes | Yes |
| Virtual DOM | No | Yes | Yes |
| Learning Curve | Minimal | Moderate | Moderate |
| Web Components | Native | Optional | No |

\* *Optional with Vite for .lego files*

## Browser Support

Lego works in all modern browsers that support:
- Web Components
- Shadow DOM
- ES6 Proxy
- Template literals

This includes Chrome 63+, Firefox 63+, Safari 11.1+, and Edge 79+.

## Community
- 💬 [Discussions](https://github.com/rayattack/LegoDOM/discussions)
- 🐛 [Issue Tracker](https://github.com/rayattack/LegoDOM/issues)
- 📦 [npm Package](https://www.npmjs.com/package/lego-dom)
