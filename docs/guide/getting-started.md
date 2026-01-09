# Getting Started

Get up and running with Lego in under 5 minutes.

## Installation

### Option 1: CDN (No Build Tools)

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
    <p>Count: {{ count }}</p>
  </template>
</body>
</html>
```

That's it! Open this HTML file in any browser and it works.

### Option 2: npm

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
  <p>Count: {{ count }}</p>
`, {
  count: 0,
});
```

### Option 3: With Vite (Recommended for Larger Projects)

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

## Your First Component

Let's create a simple counter component.

### Using HTML Templates

```html
<template b-id="click-counter" b-data="{ message: 'Welcome!', count: 0 }">
  <style>
    self {
      display: block;
      padding: 2rem;
      text-align: center;
      background: #f0f0f0;
      border-radius: 8px;
    }
    button {
      font-size: 1.2rem;
      padding: 0.5rem 1.5rem;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #45a049;
    }
  </style>
  
  <template b-id="click-counter" b-data="{ message: 'Welcome!', count: 0 }">
    ... markup ...
  </template>
  
  <!-- Uses defaults: message="Welcome!", count=0 -->
  <click-counter></click-counter>

  <!-- Overrides message, keeps count=0 -->
  <click-counter b-data="{ message: 'Bienvenido!' }"></click-counter>

<script src="https://unpkg.com/lego-dom/main.js"></script>
```

### Using JavaScript

```js
import { Lego } from 'lego-dom';

Lego.define('click-counter', `
  <style>
    self {
      display: block;
      padding: 2rem;
      text-align: center;
    }
  </style>
  
  <h2>{{ message }}</h2>
  <p>Count: {{ count }}</p>
  <button @click="increment()">Click Me!</button>
`, {
  message: 'Welcome!',
  count: 0,
  increment() {
    this.count++;
  }
});
```

Then use it in your HTML:

```html
<click-counter></click-counter>
```

### Using .lego Files (with Vite)

Create `src/components/click-counter.lego`:

```html
<template>
  <style>
    self {
      display: block;
      padding: 2rem;
    }
  </style>
  
  <h2>{{ message }}</h2>
  <p>Count: {{ count }}</p>
  <button @click="increment()">Click Me!</button>
</template>

<script>
export default {
  message: 'Welcome!',
  count: 0,
  increment() {
    this.count++;
  }
}
</script>
```

The Vite plugin automatically discovers and registers it!

## Understanding the Basics

### 1. Templates

Templates define what your component looks like. Use `{{ }}` for dynamic content:

```html
<h1>Hello {{ name }}!</h1>
<p>{{ calculateAge() }} years old</p>
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

```html
<p b-show="isLoggedIn">Welcome back!</p>
<li b-for="item in items">{{ item.name }}</li>
<input b-sync="username" />
```

## What You've Learned

- ✅ Three different ways to install Lego
- ✅ How to create your first component
- ✅ The basics of templates, state, and events
- ✅ Available directives
- ✅ The importance of the `Lego.init()` engine

## Next Steps

- Learn about [Components](/guide/components) in depth
- Explore [Reactivity](/guide/reactivity) and how it works
- Check out [Templating](/guide/templating) features
- See [Examples](/examples/) of real applications
