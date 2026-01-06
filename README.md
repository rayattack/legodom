# LegoJS

LegoJS is a tiny, zero-dependency JavaScript library for building reactive Web Components directly in the browser.

The goal of LegoJS is **mental model simplicity**:

* No virtual DOM
* No compilation step required
* No JSX
* No framework-specific syntax to learn

You write **HTML**, add a few **directives**, and LegoJS takes care of reactivity and updates.

This README is intentionally designed so that a developer can understand **everything they need** about LegoJS by reading this file alone.

---

## Installation

The package name on npm is **`lego-dom`** (the name `legojs` was already taken).

```bash
npm install lego-dom
```

Or include it directly in the browser:

```html
<script src="node_modules/lego-dom/main.js"></script>
```

Once loaded, `Lego` is available globally.

---

## The Mental Model

Think of LegoJS like real Lego blocks:

* **Templates** define how a block looks
* **Studs** define the data attached to a block
* **Directives** snap data to the DOM
* **Changes to data automatically update the DOM**

There is no mounting, diffing, or reconciliation engine.

You change JavaScript objects → LegoJS updates the DOM.

---

## Defining a Component (Block)

A component is defined using a standard HTML `<template>` with a `b-id`.

```html
<template b-id="hello-card">
  <style>
    self {
      display: block;
      padding: 1rem;
      border: 1px solid #ccc;
    }
  </style>

  <h2>Hello {{ name }}</h2>
  <button @click="count++">Clicked {{ count }} times</button>
</template>
```

Use the component in HTML:

```html
<hello-card b-data="{ name: 'Ahmed', count: 0 }"></hello-card>
```

---

## Reactive State (`studs`)

Each component has a reactive state object internally called **studs**.

* Defined via `b-data` or component logic
* Implemented using JavaScript `Proxy`
* Any mutation automatically schedules a re-render

```html
<button @click="count++"></button>
```

No setters. No actions. No reducers.

Just mutate data.

---

## Templating (`{{ }}`)

Text interpolation works in:

* Text nodes
* Attributes
* Class names

```html
<p>Hello {{ user.name }}</p>
<img src="/avatars/{{ user.id }}.png">
```

Expressions are plain JavaScript.

---

## Event Handling (`@event`)

Use `@` followed by any DOM event.

```html
<button @click="submit()">Submit</button>
```

The expression runs in the component’s state scope.

You also have access to:

* `event` – the native DOM event
* `$emit(name, detail)` – dispatch custom events
* `$element` – the host custom element

---

## Conditional Rendering (`b-if`)

```html
<p b-if="isLoggedIn">Welcome back</p>
```

When the expression is falsy, the element is hidden via `display: none`.

---

## Lists (`b-for`)

Render lists using `b-for`:

```html
<ul>
  <li b-for="todo in todos">
    <input type="checkbox" b-sync="todo.done">
    <span class="{{ todo.done ? 'done' : '' }}">{{ todo.text }}</span>
  </li>
</ul>
```

* DOM nodes are reused
* Items are tracked internally
* Updates are efficient without a virtual DOM

---

## Two-Way Binding (`b-sync`)

`b-sync` keeps inputs and state in sync.

```html
<input b-sync="username">
<input type="checkbox" b-sync="settings.enabled">
```

Works with:

* text inputs
* checkboxes
* nested objects
* items inside `b-for`

---

## Styling and Shadow DOM

Every component uses **Shadow DOM** automatically.

Inside `<style>` blocks:

* Use `self` to target the component root
* `self` is converted to `:host`

```css
self {
  display: block;
}
```

Styles never leak in or out.

---

## Lifecycle Hooks

Define lifecycle methods directly on the component state:

```js
{
  mounted() {
    console.log('Component attached');
  },
  updated() {
    console.log('State changed');
  },
  unmounted() {
    console.log('Component removed');
  }
}
```

---

## Custom Events (`$emit`)

Child components communicate upward using events.

```html
<button @click="$emit('save', data)">Save</button>
```

Events:

* bubble
* cross Shadow DOM boundaries
* are standard `CustomEvent`s

---

## Accessing Ancestors (`$ancestors`)

Read state from the nearest ancestor component:

```html
<p>{{ $ancestors('app-shell').user.name }}</p>
```

This is intended for **reading**, not mutation.

---

## Shared State (`$registry`)

Components defined via `Lego.define` get a shared singleton state.

```js
$registry('settings').theme
```

Useful for global configuration or app-wide state.

---

## Router

LegoJS includes a minimal client-side router.

Add a router outlet:

```html
<lego-router></lego-router>
```

Define routes:

```js
Lego.route('/', 'home-page');
Lego.route('/user/:id', 'user-page');
```

Access route params:

```html
<p>User ID: {{ global.params.id }}</p>
```

Navigation:

```html
<a href="/dashboard" b-link>Dashboard</a>
```

---

## Programmatic Navigation

```js
history.pushState({}, '', '/success');
window.dispatchEvent(new PopStateEvent('popstate'));
```

---

## Defining Components in JavaScript

You can also define components programmatically:

```js
Lego.define(
  'counter-box',
  `
  <style>self { display:block }</style>
  <button @click="count++">{{ count }}</button>
  `,
  { count: 0 }
);
```

---

## Initialization

LegoJS initializes automatically on `DOMContentLoaded`.

You usually do **not** need to call anything manually.

---

## Design Philosophy

LegoJS is intentionally small and opinionated:

* The DOM is the source of truth
* JavaScript objects are the state
* HTML stays HTML
* Complexity is avoided unless absolutely necessary

If you can explain your UI with plain objects and markup, LegoJS will feel natural.

---

## Single File Components (SFC)

LegoJS supports **Single File Components** using `.lego` files when using a build tool like Vite.

### .lego File Format

A `.lego` file contains three optional sections:

```html
<template>
  <!-- Your HTML markup with directives -->
  <h1>{{ title }}</h1>
  <button @click="count++">{{ count }}</button>
</template>

<script>
export default {
  // Your component logic/state
  title: 'Hello',
  count: 0
}
</script>

<style>
  /* Scoped CSS using self keyword */
  self {
    display: block;
    padding: 1rem;
  }
</style>
```

The component name is automatically derived from the filename (e.g., `sample-component.lego` → `<sample-component>`).

---

## Vite Plugin Setup

### Installation

```bash
npm install lego-dom vite
```

### Configuration

Create `vite.config.js`:

```js
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [
    legoPlugin({
      componentsDir: './src/components',  // Where to look for .lego files
      include: ['**/*.lego']              // Glob patterns to match
    })
  ]
});
```

### Usage

Create your components in `.lego` files:

```
src/
  components/
    my-button.lego
    user-card.lego
  main.js
index.html
```

In your `main.js`:

```js
import { Lego } from 'lego-dom/main.js';
import registerComponents from 'virtual:lego-components';

registerComponents();
```

In your HTML:

```html
<my-button></my-button>
<user-card></user-card>
```

**Auto-discovery**: The Vite plugin automatically finds all `.lego` files and registers them with LegoJS!

---

## Two Usage Modes

LegoJS works in **two modes**:

### 1. Without Build Tooling

Include `main.js` directly and use `<template b-id>` or `Lego.define()`:

```html
<script src="node_modules/lego-dom/main.js"></script>
<template b-id="my-component">
  <h1>Hello</h1>
</template>
```

### 2. With Vite (SFC)

Use `.lego` files that are auto-discovered and compiled:

```bash
npm run dev
```

Both modes use the same LegoJS runtime and support all the same features!

---

## Summary

* Install with `npm install lego-dom`
* Define components with `<template b-id>`
* Use `b-data` for state
* Use `{{ }}` for binding
* Use `@event` for logic
* Use `b-if`, `b-for`, and `b-sync` for structure

That’s it.
