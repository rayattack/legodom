# Lego SFC and Vite Plugin Example

This example demonstrates how to use Lego with Single File Components (.lego files) and the Vite plugin.

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
│   ├── blocks/          # .lego files auto-discovered here
│   │   ├── sample-block.lego
│   │   └── greeting-card.lego
│   └── main.js              # Entry point
├── index.html               # HTML shell
├── vite.config.js           # Vite configuration with lego plugin
└── package.json
```

## How It Works

1. The Vite plugin scans `src/blocks/` for `.lego` files
2. Each `.lego` file is parsed and transformed into a `Lego.block()` call
3. The virtual module `virtual:lego-blocks` imports all discovered blocks
4. Components are automatically registered and available in your HTML

## Creating Components

Create a new `.lego` file in `src/blocks/`:

```html
<template>
  <h1>[[ message ]]</h1>
  <button @click="count++">[[ count ]]</button>
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
<your-block-name></your-block-name>
```

The block name is automatically derived from the filename (kebab-case required).
