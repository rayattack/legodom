---
layout: home

hero:
  name: LegoDOM
  text: Build components. Use them as HTML.
  tagline: Reactive web components with no imports, no virtual DOM, and no required build step. About 18 KB gzipped.
  image:
    src: /logo.svg
    alt: LegoDOM
  actions:
    - theme: brand
      text: Start the tutorial
      link: /tutorial/
    - theme: alt
      text: Quickstart
      link: /quickstart/
    - theme: alt
      text: GitHub
      link: https://github.com/rayattack/LegoDOM

features:
  - icon: 🧱
    title: No imports
    details: Define a .lego file. Use the tag anywhere it should appear. The runtime registers it as a real Custom Element.

  - icon: ✨
    title: Plain reactivity
    details: Mutate the data, the DOM follows. ES6 Proxies do the work. No setState, no hooks, no API to learn.

  - icon: ⚡
    title: No virtual DOM
    details: Direct DOM updates with fine-grained dependency tracking. Only the bindings that read changed data re-run.

  - icon: 🎯
    title: Surgical routing
    details: Tell each link which region to swap. Sidebars, scroll position, and in-progress forms all survive navigation.

  - icon: 💾
    title: One-line persistence
    details: A reactive property that survives refresh and syncs across tabs. No state library, no glue code.

  - icon: 🌐
    title: Drop into any stack
    details: Real Web Components. They work inside React, Vue, Svelte, plain HTML, or as your whole app.
---
