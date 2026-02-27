# Vite Plugin API

Lego includes a Vite plugin for processing `.lego` Single File Blocks.

## Installation

```bash
npm install vite lego-dom
```

## Usage

```js
// vite.config.js
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [
    legoPlugin({
      // Options
    })
  ]
});
```

## Options

### `blocksDir`

- **Type**: `string`
- **Default**: `'./src'`

Directory to search for `.lego` files.

### `include`

- **Type**: `string | string[]`
- **Default**: `'**/*.lego'`

Glob pattern(s) to match files.

### `exclude`

- **Type**: `string | string[]`
- **Default**: `null`

Glob pattern(s) to exclude files.

## Virtual Module

The plugin exposes a virtual module to register all blocks:

```js
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();
```
