# Lego.block()

Defines a block from a string template. Equivalent to writing a `<template b-id>` in HTML, but usable in pure JS, common in CDN setups, ad-hoc registrations, or when the source isn't a `.lego` file.

There are two call shapes. The positional one is the original:

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

and an options object, which is the one to reach for once a block needs anything past `props`:

```ts
Lego.block(tagName: string, options: {
  template?: string,
  logic?: object,
  styles?: string,
  cascade?: string,
  error?: string,
  props?: string,
  shadow?: boolean,
  form?: boolean
}): void
```

Both do exactly the same thing. `shadow` and `form` have no positional slot, so a block that needs either has to use the options form.

## Parameters

| Name | Type | Effect |
|---|---|---|
| `tagName` | `string` | Custom-element tag. Must contain a hyphen. |
| `template` / `templateHTML` | `string` | The block's template body, same shape you'd put inside `<template b-id="…">…</template>`. May include a leading `<style>…</style>`. |
| `logic` | `object` | Initial state. Methods, getters, lifecycle hooks (`mounted`, `beforeUpdate`, `updated`, `unmounted`, `errorCaptured`) all live here. |
| `styles` | `string` | Space-separated stylesheet keys (registered via `Lego.init({ styles })`). Maps to `b-stylesheets`. |
| `cascade` | `string` | Space-separated keys to cascade to descendants. Maps to `b-cascade`. |
| `error` | `string` | Tag name of an error block to render when this block crashes. Maps to `b-error`. |
| `props` | `string` | Declared prop contract. See [Props](/tutorial/props). Maps to `b-props`. |
| `shadow` | `boolean` | `false` renders the block into the light DOM instead of a shadow root. Maps to `b-shadow="false"`. |
| `form` | `boolean` | `true` makes the block form associated. Maps to `b-form`. |

## shadow: false

By default every block gets a shadow root, which is what keeps its styles and its DOM to itself. That boundary also blocks things you sometimes want: a page-level stylesheet, an `aria-labelledby` pointing at an id outside the block, a native form collecting the block's fields on submit.

`shadow: false` renders the template into the element itself instead:

```js
Lego.block('settings-row', {
  template: `
    <style>
      self { display: flex; gap: 1rem; }
      label { font-weight: 600; }
    </style>
    <label for="[[ fieldId ]]"><slot name="label"></slot></label>
    <slot></slot>
  `,
  shadow: false
});
```

What changes:

- **Styles are scoped by rewriting, not by a boundary.** Every selector in the block's `<style>` is prefixed with the tag name, `self` becomes the tag name itself, and the result is injected into `<head>` once per block (not once per instance) with a `data-lego-style="settings-row"` marker. `@media` and `@supports` are rewritten inside; `@keyframes` and `@font-face` are left alone.
- **Page CSS reaches in.** That is the point.
- **Slots are emulated.** See [Slots](/tutorial/slots#light-dom-slots).
- **The block's own reactivity is unchanged.** Bindings, directives and props all work the same.

## form: true

A form block is a [form-associated custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Attributes#form-associated_custom_elements). It gains `$form` on its state, and if its state has a `value` key, that value is what the surrounding `<form>` submits under the element's `name`.

```js
Lego.block('rating-input', {
  template: `<button @click="value = value + 1">[[ value ]] stars</button>`,
  logic: {
    value: 0,
    mounted() {
      if (this.value === 0) this.$form.setValidity({ valueMissing: true }, 'Pick a rating');
    }
  },
  form: true
});
```

```html
<form>
  <rating-input name="rating"></rating-input>
  <button>Submit</button>
</form>
```

`$form` delegates straight to the element's `ElementInternals`:

| Member | Effect |
|---|---|
| `setValue(value, state?)` | Set the submitted value explicitly. |
| `setValidity(flags, message?, anchor?)` | Publish validity. `setValidity({})` clears it. |
| `checkValidity()` / `reportValidity()` | The usual constraint-validation pair. |
| `form` / `name` / `validity` | Read-only passthroughs. |

Two extra hooks land on state automatically: a form reset restores `value` to what it was at mount, and a disabled fieldset sets `$disabled`.

::: warning Defined once
`formAssociated` and `observedAttributes` are read by the browser at custom-element definition time, so `form: true` and the prop contract have to be known before the tag is defined. That is true for `Lego.block()`, `.lego` files and inline `<template b-id>`. A block loaded lazily from a manifest is defined before its source arrives, so it cannot be form associated; its props still reflect, through a per-instance observer.
:::

## Behavior

`Lego.block()`:

1. Creates a `<template>` element, stamps the metadata attributes (`b-id`, `b-stylesheets`, `b-cascade`, `b-error`, `b-props`, `b-shadow`, `b-form`), and stores it in the registry under `tagName`.
2. Stores `logic` keyed by `tagName` (the script tier of the [three-tier merge](/tutorial/blocks#data-merging-the-three-tiers)).
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
Lego.block('order-row', {
  template: `<tr><td>[[ id ]]</td><td>[[ total ]]</td></tr>`,
  logic: {
    mounted() { /* … */ }
  },
  styles: 'tables',                        // b-stylesheets
  cascade: '',                             // b-cascade
  error: 'row-error',                      // b-error fallback
  props: 'id: String, total: Number = 0',  // b-props contract
  shadow: false,                           // render into the light DOM
  form: false
});
```

The same thing positionally, for the six options that have a slot:

```js
Lego.block(
  'order-row',
  `<tr><td>[[ id ]]</td><td>[[ total ]]</td></tr>`,
  { mounted() { /* … */ } },
  'tables',
  '',
  'row-error',
  'id: String, total: Number = 0'
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
