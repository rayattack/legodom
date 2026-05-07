# Vite Plugin

Transforms `.lego` Single File Block files into runtime registrations. Provides a virtual module that auto-imports every block in your project, plus HMR.

```js
// vite.config.js
import { defineConfig } from 'vite';
import lego from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [lego({ blocksDir: './src' })]
});
```

## Options

```ts
interface LegoPluginOptions {
  blocksDir?: string;        // default './src'
  include?: string[];        // default ['**/*.lego']
  importPath?: string;       // default 'lego-dom'
}
```

| Option | Default | Effect |
|---|---|---|
| `blocksDir` | `'./src'` | Root for auto-discovery, resolved against `vite.root`. |
| `include` | `['**/*.lego']` | Glob(s) (passed to `fast-glob`) for which files count as blocks. |
| `importPath` | `'lego-dom'` | Module specifier emitted at the top of each transformed `.lego` file (override only if you've aliased `lego-dom`). |

## Virtual module

The plugin exposes a virtual import that, when called, ensures every discovered `.lego` file is registered:

```js
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();
```

Internally the virtual module is a list of side-effect imports — pulling them in is what runs the `Lego.block(...)` calls. `registerBlocks()` is mostly a no-op kept around for ergonomics; you could equally well delete the call as long as you keep the import.

## What `.lego` files compile to

A file like:

```html
<!-- src/user-card.lego -->
<template b-stylesheets="cards">
  <h3>[[ name ]]</h3>
</template>

<script>
export default {
  name: 'Alice'
}
</script>

<style>
  h3 { color: var(--accent); }
</style>
```

is transformed at load time to:

```js
import { Lego } from 'lego-dom';
const $db = Lego.db;

Lego.block('user-card',
  '<style>h3 { color: var(--accent); }</style><h3>[[ name ]]</h3>',
  { name: 'Alice' },
  'cards', '', '', ''
);

export default 'user-card';

if (import.meta.hot) {
  import.meta.hot.accept(() => {});
}
```

Tag name is derived from the filename — `user-card.lego` → `user-card`, `UserCard.lego` → `user-card`, `user_card.lego` → `user-card`. Filenames must produce a name with a hyphen.

## TypeScript

If a script tag carries `lang="ts"`, its body is compiled to JS via `esbuild`'s TypeScript loader before being inlined.

```html
<script lang="ts">
interface User { id: number; name: string; }

export default {
  user: null as User | null,
  async mounted() {
    this.user = await fetch('/api/me').then(r => r.json());
  }
}
</script>
```

## HMR

The plugin emits HMR-aware code so that:

- Editing a `.lego` file re-runs `Lego.block(...)`. The runtime catches the re-registration and refreshes every live instance (unsnap → snap), preserving DOM identity.
- Adding or removing `.lego` files invalidates the virtual module so newly created blocks become available without a full reload.

There's no special HMR boundary you have to declare — saving a `.lego` file is enough.

## Block discovery

`fast-glob` walks `blocksDir` for the `include` patterns. Only files imported (directly or via the virtual module) end up in the bundle — discovery just guarantees the glob is materialized.

If you have blocks under multiple directories, register them by importing from outside `blocksDir`:

```js
// src/app.js
import registerBlocks from 'virtual:lego-blocks';
import './blocks-extra/admin.lego';

registerBlocks();
```
