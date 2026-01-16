# Quick Start

The fastest way to get started with Lego is using the CDN. No build tools required!

## Your First Component

Let's create a simple counter component.

### Using HTML

::: tip 🚀 HTML vs SFC
In HTML `<style>` goes inside `<template></template>` tags but in SFCs the appear outside
`<template></template>` tags.
:::


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
  
  <div>
    ... markup ...
  </div>
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
  
  <h2>[[ message ]]</h2>
  <p>Count: [[ count ]]</p>
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
<style>
  self {
    display: block;
    padding: 2rem;
  }
</style>

<template>
  <h2>[[ message ]]</h2>
  <p>Count: [[ count ]]</p>
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

## Next Steps

- Explore [Core Concepts](/guide/components)
- Check out the [API Reference](/api/)
