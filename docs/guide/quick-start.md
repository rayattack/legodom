# Quick Start

The fastest way to get started with Lego is using the CDN. No build tools required!

## Your First Block

Let's create a simple counter block.

### Using HTML

::: tip 🚀 HTML vs Lego Files
In HTML `<style>` goes inside `<template></template>` tags but in Lego Files they appear outside
`<template></template>` tags.
:::


```html
<template b-id="click-counter" b-logic="{ message: 'Welcome!', count: 0 }">
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
<click-counter b-logic="{ message: 'Bienvenido!' }"></click-counter>

<script src="https://unpkg.com/lego-dom"></script>
```


### Using JavaScript

```js
import { Lego } from 'lego-dom';

Lego.block('click-counter', `
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

Create `src/click-counter.lego` (the Vite plugin discovers anything matching `**/*.lego` under `src/`):

```html
<script>
export default {
  message: 'Welcome!',
  count: 0,
  increment() {
    this.count++;
  }
}
</script>

<template>
  <h2>[[ message ]]</h2>
  <p>Count: [[ count ]]</p>
  <button @click="increment()">Click Me!</button>
</template>

<style>
  self {
    display: block;
    padding: 2rem;
  }
</style>
```

The Vite plugin automatically discovers and registers it!

## Next Steps

- Explore [Core Concepts](/guide/blocks)
- Check out the [API Reference](/api/)
