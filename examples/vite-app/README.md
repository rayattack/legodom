# LegoJS SFC and Vite Plugin Example

This example demonstrates how to use LegoJS with Single File Components (.lego files) and the Vite plugin.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the dev server:
```bash
npm run dev
```

3. Open your browser to the URL shown (usually `http://localhost:5173`)

## Structure

```
examples/vite-app/
├── src/
│   ├── components/          # .lego files auto-discovered here
│   │   ├── sample-component.lego
│   │   └── greeting-card.lego
│   └── main.js              # Entry point
├── index.html               # HTML shell
├── vite.config.js           # Vite configuration with lego plugin
└── package.json
```

## How It Works

1. The Vite plugin scans `src/components/` for `.lego` files
2. Each `.lego` file is parsed and transformed into a `Lego.define()` call
3. The virtual module `virtual:lego-components` imports all discovered components
4. Components are automatically registered and available in your HTML

## Creating Components

Create a new `.lego` file in `src/components/`:

```html
<template>
  <h1>{{ message }}</h1>
  <button @click="count++">{{ count }}</button>
</template>

<script>
export default {
  message: 'Hello!',
  count: 0
}
</script>

<style>
  self {
    display: block;
    padding: 1rem;
  }
</style>
```

Then use it in your HTML:

```html
<your-component-name></your-component-name>
```

The component name is automatically derived from the filename (kebab-case required).
