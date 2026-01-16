# Getting Started

Get up and running with Lego in under 5 minutes.

::: tip 🚀 Want a Complete Walkthrough?
Check out our **[Step-by-Step Tutorial](/tutorial/)** – build a full multi-page app from scratch in 15 minutes!
:::

## Installation

### Option 1 (HTML): CDN (No Build Tools)

The fastest way to try Lego is via CDN:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Lego App</title>
</head>
<body>
  <my-component></my-component>
  
  <script src="https://unpkg.com/lego-dom/main.js"></script>
  <template b-id="my-component" b-data="{ count: 0 }">
    <h1>Hello Lego!</h1>
    <button @click="count++">Click me</button>
    <p>Count: [[ count ]]</p>
  </template>
</body>
</html>
```

That's it! Open this HTML file in any browser and it works.

### Option 2 (JS): npm

For projects using npm:

```bash
npm install lego-dom
```

Then import it:

```js
import { Lego } from 'lego-dom';

Lego.define('my-component', `
  <h1>Hello Lego!</h1>
  <button @click="count++">Click me</button>
  <p>Count: [[ count ]]</p>
`, {
  count: 0,
});
```

### Option 3 (SFC): With Vite (Recommended for Larger Projects)

For the best development experience with `.lego` Single File Components:

```bash
npm create vite@latest my-lego-app
cd my-lego-app
npm install lego-dom
```

Configure `vite.config.js`:

```js
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [legoPlugin()]
});
```

### The Runtime Engine

Crucially, you must initialize the Lego background engine in your entry file (`src/main.js`):

```js
import { Lego } from 'lego-dom';
import registerComponents from 'virtual:lego-components';

// 1. Register SFCs
registerComponents();

// 2. Start the Engine (Async)
await Lego.init();
```

## Understanding the Basics

### 1. Templates

Templates define what your component looks like. Use `[[ ]]` for dynamic content:

```html
<h1>Hello [[ name ]]!</h1>
<p>[[ calculateAge() ]] years old</p>
```

### 2. State (Studs)

Each component has reactive state called "studs":

```js
{ 
  name: 'Alice',
  age: 25,
  calculateAge() {
    return new Date().getFullYear() - 1999;
  }
}
```

### 3. Events

Use `@eventname` to handle events:

```html
<button @click="handleClick()">Click</button>
<input @input="handleInput()" />
<form @submit="handleSubmit(event)">
```

### 4. Directives

Special attributes for common patterns:

- `b-show` - Conditional rendering
- `b-for` - List rendering
- `b-sync` - Two-way binding

For extensive information, see [Directives](/guide/directives).


```html
<p b-show="isLoggedIn">Welcome back!</p>
<li b-for="item in items">[[ item.name ]]</li>
<input b-sync="username" />
```

## What You've Learned

- ✅ How to install LegoDOM
- ✅ The 3 (three) different ways that exist to create componentS
- ✅ The basics of templates, state, and events
- ✅ A sneak peek into the world of directives
- ✅ The use of the `Lego.init()` to kickstart LegoDOM.

## Next Steps

- Learn about [Components](/guide/components) in depth
- Explore [Reactivity](/guide/reactivity) and how it works
- Check out [Templating](/guide/templating) features
- See [Examples](/examples/) of real applications
