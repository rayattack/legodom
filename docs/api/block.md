# Lego.block()

Defines a block from a string template. Equivalent to writing a `<template b-id>` in HTML, but usable in pure JS, common in CDN setups, ad-hoc registrations, or when the source isn't a `.lego` file.

```ts
Lego.block(
  tagName: string,
  templateHTML: string,
  logic?: object,
  styles?: string,
  cascade?: string,
  error?: string,
  props?: string
): void
```

## Parameters

| Name | Type | Effect |
|---|---|---|
| `tagName` | `string` | Custom-element tag. Must contain a hyphen. |
| `templateHTML` | `string` | The block's template body, same shape you'd put inside `<template b-id="…">…</template>`. May include a leading `<style>…</style>`. |
| `logic` | `object` | Initial state. Methods, getters, lifecycle hooks (`mounted`, `updated`, `unmounted`) all live here. |
| `styles` | `string` | Space-separated stylesheet keys (registered via `Lego.init({ styles })`). Maps to `b-stylesheets`. |
| `cascade` | `string` | Space-separated keys to cascade to descendants. Maps to `b-cascade`. |
| `error` | `string` | Tag name of an error block to render when this block crashes. Maps to `b-error`. |
| `props` | `string` | Declared prop contract. Maps to `b-props`. |

## Behavior

`Lego.block()`:

1. Creates a `<template>` element, stamps the metadata attributes (`b-id`, `b-stylesheets`, `b-cascade`, `b-error`, `b-props`), and stores it in the registry under `tagName`.
2. Stores `logic` keyed by `tagName` (the script tier of the [three-tier merge](/guide/blocks#data-merging-the-three-tiers)).
3. Registers `tagName` as a custom element (no-op if already registered).
4. If `tagName` was previously defined, all live instances are unsnapped and re-snapped, this is the HMR / re-definition path.

You can call `Lego.block()` before or after `Lego.init()`, both orders work.

## Example

```js
import { Lego } from 'lego-dom';

Lego.block('user-card', `
  <style>
    self { display: block; padding: 1rem; border: 1px solid #ddd; }
    h3 { margin: 0 0 0.5rem; }
  </style>
  <h3>[[ name ]]</h3>
  <p>[[ role ]]</p>
  <button @click="promote()">Promote</button>
`, {
  name: 'Alice',
  role: 'Member',
  promote() {
    this.role = 'Admin';
  }
});

document.body.innerHTML = '<user-card></user-card>';
await Lego.init();
```

### With every option

```js
Lego.block(
  'order-row',
  `<tr><td>[[ id ]]</td><td>[[ total ]]</td></tr>`,
  {
    id: '',
    total: 0,
    mounted() { /* … */ }
  },
  'tables',                // b-stylesheets
  '',                      // b-cascade
  'row-error',             // b-error fallback
  'id, total'              // b-props contract
);
```

## Lego.defineLegoFile()

Runtime parser for `.lego` Single File Blocks. Used by the Vite plugin and by the runtime [loader](/api/init#options-loader) and [manifest](/api/init#options-manifest) paths. You can call it directly when you have SFC content as a string and want to register it without a build step.

```ts
Lego.defineLegoFile(content: string, filename?: string): void
```

- `content`, raw `.lego` text containing one or more of `<template>`, `<script>`, `<style>`.
- `filename`, used to derive the block name (kebab-cased, must contain a hyphen). Defaults to `'block.lego'`, which is rejected, pass a real name.

The block name is derived from the filename:

- `user-card.lego` → `user-card`
- `UserCard.lego` → `user-card`
- `user_card.lego` → `user-card`

```js
const sfc = await fetch('/blocks/user-card.lego').then(r => r.text());
Lego.defineLegoFile(sfc, 'user-card.lego');

document.body.innerHTML = '<user-card></user-card>';
```

After definition, any pre-existing instances of the tag in the DOM are upgraded automatically.
