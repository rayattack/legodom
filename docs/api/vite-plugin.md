# Vite Plugin API

Lego includes a Vite plugin for processing `.lego` Single File Components.

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

### `componentsDir`

- **Type**: `string`
- **Default**: `'src/components'`

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

The plugin exposes a virtual module to register all components:

```js
import registerComponents from 'virtual:lego-components';

registerComponents();
```
