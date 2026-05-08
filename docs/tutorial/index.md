# What is Lego?

LegoDOM is a tiny, zero-dependency JavaScript library for building reactive Web Components directly in the browser.

## The Philosophy

LegoDOM is built on a simple belief: **the DOM is not your enemy**.

Modern frameworks introduced virtual DOMs and compilation steps to solve problems that arose from trying to make the DOM do things it wasn't designed for. Lego takes a different approach it embraces the DOM and Web Components as they were intended to be used.

## Key Principles

### 1. Mental Model Simplicity

There are no new concepts to learn. If you know:
- HTML
- JavaScript objects
- Basic DOM events

You already know Lego.

### 2. No Build Step Required

Drop a `<script>` tag in your HTML and you're ready to go. Build tools are optional, not mandatory.

### 3. True Reactivity

Change an object → the DOM updates. That's it. No `setState`, no `dispatch`, no `computed properties` to configure.

```js
// This just works
block.state.count++;
```

### 4. Web Standards First

Lego uses:
- **Web Components** - Standard custom elements
- **Shadow DOM** - Native encapsulation
- **ES6 Proxies** - For reactivity
- **Template literals** - For templating

No proprietary APIs. Everything is built on web standards.

## When to Use Lego

### ✅ Lego is Great For:

- **Applications of any scale** - From prototypes to enterprise systems with hundreds of blocks
- **Multi-domain applications** - HRIS, CRM, Finance, Planning systems with complex business logic
- **Embedded widgets** that need to work anywhere without conflicts
- **Progressive enhancement** of existing sites
- **Teams that value simplicity** over framework complexity
- **Projects requiring full control** with zero dependencies
- **Learning** how reactive systems work under the hood

### ⚠️ Consider Alternatives If:

- You need a massive ecosystem of pre-built UI blocks (though LegoDOM blocks are easy to build)
- Your team is already deeply invested in React/Vue/Angular and migration isn't justified
- You require TypeScript with full type inference (LegoDOM works with TS but doesn't provide built-in types)

::: tip SSC vs SSR
LegoDOM supports **SSC (Server-Side Blocks)** - you can render blocks on the server and hydrate them on the client. This is simpler and more efficient than traditional SSR frameworks that require complex hydration strategies.
:::

## How small is it?

The runtime is split across `src/core/`, `src/directives/`, `src/features/`, and `src/utils/`, each module focused, well-commented, and readable in one sitting. Zero runtime dependencies. The Vite plugin is the only optional `peerDependency` (`fast-glob` is the lone dev-time dependency for block discovery).

Reading the source end-to-end is a feasible weekend project, and a great way to internalize how reactivity and surgical routing actually work.

## What Makes It Different?

| Aspect | Lego | Traditional Frameworks |
|--------|--------|----------------------|
| **Reactivity** | Direct object mutation | setState / dispatch / ref() |
| **Templates** | HTML with <code v-pre>[[ ]]</code> | JSX / template syntax |
| **Styles** | Shadow DOM (native) | CSS-in-JS / scoped CSS |
| **Build** | Optional | Required |
| **Learning Curve** | Hours | Days/Weeks |
|**Philosophy** | Embrace the platform | Abstract the platform |

## Coming from React or Svelte?

If you already know React or Svelte, here's how LegoDOM concepts map to what you know:

| What You Know | LegoDOM Equivalent | Example |
|---|---|---|
| Component | **Block** | `<template b-id="my-block">` or `.lego` file |
| JSX / Svelte template | **Template** with `[[ ]]` interpolation | `<p>[[ message ]]</p>` |
| `useState` / `let` (Svelte) | **Direct assignment** (Proxy reactivity) | `this.count++` |
| `useEffect` / `onMount` | **`mounted()`** lifecycle hook | `mounted() { this.fetchData() }` |
| `props` / `export let` | **`b-logic`** attribute (scoped props) | `<child b-logic="{ name: parentName }">` |
| `children` / `<slot>` | **Native `<slot>`** (Shadow DOM) | `<slot name="header"></slot>` |
| Context / stores | **`Lego.globals`** + **`$registry()`** | `global.user.name` / `$registry('store')` |
| React Router / SvelteKit routes | **`Lego.route()`** + **`b-target`** | `Lego.route('/users/:id', 'user-page')` |
| Error Boundary | **`b-error`** attribute | `<my-block b-error="error-fallback">` |
| `useRef` / `bind:this` | **`b-var`** + **`$vars`** | `<input b-var="nameInput">` → `$vars.nameInput` |
| `.map()` for lists | **`b-for`** directive | `<li b-for="item in items">[[ item ]]</li>` |
| Ternary in JSX / `{#if}` | **`b-if`** / **`b-show`** | `<p b-if="isLoggedIn">Welcome</p>` |
| `onChange` / `on:input` | **`@input`** / **`b-sync`** | `<input b-sync="name">` |
| CSS Modules / scoped styles | **Shadow DOM** (automatic) | Styles in `<style>` are scoped by default |
| Redux / Svelte stores | **`$db`** (persistent) or **`Lego.globals`** (shared) | `$db('theme').default('light')` |

::: tip Key Difference
In React and Svelte, you explicitly tell the framework about state changes (`setState`, `$:`, etc.). In LegoDOM, you just mutate your data directly, `this.count++`, and the framework detects the change automatically via ES6 Proxies.
:::

## Next Steps

Ready to dive in? Head to the [Getting Started](/tutorial/getting-started) page to build your first Lego block in under 5 minutes.
