# Helpers

Every `$`-prefixed name available inside a block. Two scopes share most of these names, JS scope (`this.$x` inside methods, getters, lifecycle hooks) and template scope (`$x` inside `[[ … ]]`, `@event="…"`, and directive expressions).

## Scope cheatsheet

| Name | JS scope (`this.$x`) | Template scope (`$x`) |
|---|---|---|
| `$element` | ✓ host element | ✓ same |
| `$vars` | ✓ DOM refs from `b-var` | ✓ same |
| `$parent` | ✓ nearest ancestor block |, (`$ancestors('*')` instead) |
| `$emit(name, detail?)` | ✓ | ✓ |
| `$ancestors(tag)` |, | ✓ |
| `$registry(tag)` |, | ✓ |
| `$route`, `$go`, `$mount`, `$db`, `$params` | ✓ | ✓ |
| `$event` / `event` |, | ✓ inside `@event` only |
| `$error` | ✓ inside error blocks | ✓ inside error blocks |
| `$initialState` | sets initial state when assigned to an element |, |

`global` (the reactive globals object) is available in template scope; in JS use `Lego.globals`.

---

## $element

The host `HTMLElement`. Useful for native DOM APIs that don't go through the framework.

```js
mounted() {
  this.$element.scrollIntoView();
}
```

## $vars

Dictionary of DOM refs collected from `b-var`.

```html
<input b-var="emailInput">
<button @click="$vars.emailInput.focus()">Edit</button>
```

```js
mounted() {
  this.$vars.emailInput.focus();
}
```

## $parent

Nearest ancestor that is itself a registered LegoDOM block (skipping plain wrapper elements). Useful for reading parent state in tightly-coupled compositions.

```js
mounted() {
  if (this.$parent) {
    console.log(this.$parent.tagName, this.$parent.state);
  }
}
```

For child-to-parent communication, prefer `$emit`, it doesn't require the child to know its parent.

## $emit(name, detail?)

Dispatches a `CustomEvent` from the host element. Always `bubbles: true` and `composed: true`, so it crosses Shadow DOM boundaries.

```html
<button @click="$emit('save', { id: 42 })">Save</button>
```

The parent listens with a normal `@event`:

```html
<task-row @save="onSave($event)"></task-row>
```

```js
onSave(e) {
  console.log(e.detail.id);  // 42
}
```

## $ancestors(tag)

Find the nearest ancestor block with a given tag (case-insensitive). Returns the element or `undefined`.

```html
<p>App: [[ $ancestors('app-root').state.title ]]</p>
```

The host's `state` property is the reactive proxy of the block, reading from it is fully reactive.

## $registry(tag)

Read the shared default state for a registered block tag. Use it for sibling-to-sibling communication via a known store-block.

```js
// shopping-cart.lego defines a `cart` array on its default state
const cart = $registry('shopping-cart');
cart.items.length;   // reactive read
```

`$registry` only exists in template-scope expressions; from JS, access the singleton element directly via `document.querySelector('shopping-cart').state`.

## $route, $params, $go

Re-exports of `Lego.globals.$route` / `.$go` and a shorthand `$params` for `$route.params`.

```html
<h1>User #[[ $route.params.id ]]</h1>
<button @click="$go('/').get()">Home</button>
```

```js
mounted() {
  console.log(this.$route.params, this.$route.query);
  this.$go('/login').get();
}
```

See the [Routing guide](/guide/routing) for the full surface.

## $mount

Imperative mount helper, alias of `Lego.mount`. Mount a tag into a target with optional initial state.

```js
openEditor(task) {
  this.$mount('task-editor', '#right-pane', { task });
}
```

```html
<button @click="$mount('settings-panel', '#side')">Settings</button>
```

See the [Dynamic mounting tutorial](/tutorial/06-dynamic-mounting) and the [advanced API](/api/advanced#lego-mount).

## $db

Persistence factory, alias of `Lego.db`. Used as a state-property descriptor (most common) or directly for `set` / `get` / `delete`.

```js
{
  theme: $db('theme').default('light'),
  draft: $db('draft').default('').debounce(500)
}
```

```js
// Imperative
this.$db('user').set({ name: 'Alice' });
this.$db('user').get();
this.$db('user').delete();
```

See the [Persistence guide](/guide/persistence).

## $event

Inside `@event` handlers, the DOM event is available as both `event` and `$event`. Both refer to the same object, `$event` is the recommended name when writing inline expressions to make the intent obvious.

```html
<input @input="search = $event.target.value">
<form @submit.prevent="save($event)">…</form>
```

## $error

Inside an error block (a fallback block named by `b-error`), the runtime injects:

```ts
$error: {
  message: string;
  stack:   string;
  component: string;   // tag name of the crashed block
}
```

```html
<template>
  <h3>Something went wrong in [[ $error.component ]]</h3>
  <p>[[ $error.message ]]</p>
</template>
```

See [Error Handling](/guide/error-handling).

## $initialState

Not a runtime read, a **write hook**. Setting `el.$initialState = { … }` on an element before it connects to the DOM seeds those values into the block's state at mount time. The runtime uses this internally for `Lego.mount(tag, target, props)` and for error boundaries (which inject `$error`).

```js
const card = document.createElement('user-card');
card.$initialState = { user: currentUser };
container.appendChild(card);
```

If you're calling `$mount(tag, target, props)`, the props you pass become `$initialState` for you. There's rarely a reason to use this property directly.

---

## Globals (template-scope only)

Inside template expressions, **`global`** (singular) is the `Lego.globals` proxy. From JS, use `Lego.globals` directly. They are the same object.

```html
<p>Hi, [[ global.user.name ]]</p>
```

```js
mounted() {
  Lego.globals.user = { name: 'Alice' };
}
```

Reading `global.x` in a template tells the scanner to subscribe this block to globals, mutations on `Lego.globals` re-render only blocks that have read from it.
