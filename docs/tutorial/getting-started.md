# Getting Started

Get up and running with Lego in under 5 minutes.

::: tip 🚀 Want a Complete Walkthrough?
Check out our **[Step-by-Step Tutorial](/quickstart/)**, build a full multi-page app from scratch in 15 minutes!
:::

## Installation

### Option 1 (Lego Files): Create LegoDOM App (Recommended)

LegoDOM's native format is the **`.lego` Single File Block**, a `<script>` for state, a `<template>` for markup, and optionally a `<style>` for scoped CSS:

```html v-pre
<!-- src/my-block.lego -->
<script>
export default {
  count: 0
}
</script>

<template>
  <h1>Hello Lego!</h1>
  <button @click="count++">Click me</button>
  <p>Count: [[ count ]]</p>
</template>
```

That's the whole component. The filename (`my-block.lego`) becomes its tag name (`<my-block>`).

To write blocks like this, scaffold a project with **`create-legodom`**, it sets up Vite, the LegoDOM plugin, and HMR for you:

::: code-group

```bash [npm]
npm create legodom@latest my-lego-app
cd my-lego-app
npm install
npm run dev
```

```bash [pnpm]
pnpm create legodom my-lego-app
cd my-lego-app
pnpm install
pnpm dev
```

```bash [yarn]
yarn create legodom my-lego-app
cd my-lego-app
yarn install
yarn dev
```

```bash [bun]
bun create legodom my-lego-app
cd my-lego-app
bun install
bun dev
```

:::

`create-legodom` already wires up your entry file (`src/app.js`) to auto-register every `.lego` file and start the engine:

```js
import { Lego } from 'lego-dom';
import 'virtual:lego-blocks'; // auto-registers every .lego file

Lego.init(); // starts the engine
```

See [Lego Files](/tutorial/lego-files) for the full format (styles, routes, globals) and [The Lego Object](/tutorial/the-lego-object) for everything `Lego.init()` can do.

<details>
<summary>Manual Setup (Alternative)</summary>

You can also set up manually with Vite:

::: code-group

```bash [npm]
npm create vite@latest my-lego-app -- --template vanilla
cd my-lego-app
npm install lego-dom
```

```bash [pnpm]
pnpm create vite my-lego-app --template vanilla
cd my-lego-app
pnpm add lego-dom
```

```bash [yarn]
yarn create vite my-lego-app --template vanilla
cd my-lego-app
yarn add lego-dom
```

```bash [bun]
bun create vite my-lego-app --template vanilla
cd my-lego-app
bun add lego-dom
```

:::

Then configure `vite.config.js`:

```js
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [legoPlugin()]
});
```
</details>

### Option 2 (HTML): CDN (No Build Tools)

The fastest way to try Lego is via CDN:

```html v-pre
<!DOCTYPE html>
<html>
<head>
  <title>My Lego App</title>
</head>
<body>
  <my-block></my-block>

  <template b-id="my-block" b-logic="{ count: 0 }">
    <h1>Hello Lego!</h1>
    <button @click="count++">Click me</button>
    <p v-pre>Count: [[ count ]]</p>
  </template>

  <script src="https://unpkg.com/lego-dom"></script>
  <script>
    Lego.init();
  </script>
</body>
</html>
```

That's it! Open this HTML file in any browser and it works.

### Option 3 (JS): Template Literals

If you're integrating into an existing build without the Vite plugin, define blocks directly in JS instead of `.lego` files:

::: code-group

```bash [npm]
npm install lego-dom
```

```bash [pnpm]
pnpm add lego-dom
```

```bash [yarn]
yarn add lego-dom
```

```bash [bun]
bun add lego-dom
```

:::

```js v-pre
import { Lego } from 'lego-dom';

Lego.block('my-block', `
  <h1>Hello Lego!</h1>
  <button @click="count++">Click me</button>
  <p>Count: [[ count ]]</p>
`, {
  count: 0
});

Lego.init();
```

## Understanding the Basics

### 1. Templates

Templates define what your block looks like. Use `[[ ]]` for dynamic content:

```html v-pre
<h1>Hello [[ name ]]!</h1>
<p>[[ calculateAge() ]] years old</p>
```

### 2. State (Logic)

Each block has reactive state called "logic". Just assign values directly, no `setState` or special syntax needed:

```js
{
  name: 'Alice',
  age: 25,
  calculateAge() {
    return new Date().getFullYear() - 1999;
  }
}
```

::: tip If You Know React
In React, you call `setCount(count + 1)` to update state. In LegoDOM, you just write `count++`. The Proxy-based reactivity system detects the change and updates the DOM automatically.
:::

### 3. Events

Use `@eventname` to handle events (similar to Vue's `@click` or Svelte's `on:click`):

```html
<button @click="handleClick()">Click</button>
<input @input="handleInput()" />
<form @submit.prevent="handleSubmit()">
```

Modifiers like `.prevent` and `.stop` work inline, no need to call `event.preventDefault()` in your handler.

### 4. Directives

Special attributes for common patterns:

| Directive | Purpose | React/Svelte Equivalent |
|-----------|---------|------------------------|
| `b-if` | Add/remove from DOM | `{condition && <El/>}` / `{#if}` |
| `b-show` | Toggle visibility | `style=&#123;&#123; display: ... &#125;&#125;` / `class:hidden` |
| `b-for` | List rendering | `.map()` / `{#each}` |
| `b-sync` | Two-way binding | `value` + `onChange` / `bind:value` |
| `b-logic` | Pass data to a block | `props` / `export let` |

For extensive information, see [Directives](/tutorial/directives).


```html v-pre
<p b-show="isLoggedIn">Welcome back!</p>
<li b-for="item in items">[[ item.name ]]</li>
<input b-sync="username" />
```

## What You've Learned

- How to install LegoDOM
- The 3 different ways to create blocks
- The basics of templates, state, and events
- A sneak peek into the world of directives
- The use of the `Lego.init()` to kickstart LegoDOM.

## Next Steps

- Learn about [Blocks](/tutorial/blocks) in depth
- Explore [Reactivity](/tutorial/reactivity) and how it works
- Check out [Templating](/tutorial/templating) features
- See [Examples](/examples/) of real applications
