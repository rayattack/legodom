# Server-Side Rendering

`lego-dom/server` renders blocks to HTML strings in Node. It is a separate
package entry with its own build, so importing it never pulls the browser
runtime, the DOM, or any dependency into your server.

```js
import { createRenderer } from 'lego-dom/server';
```

The point is a first paint that does not wait for JavaScript. The server
produces real markup, including a declarative shadow root, and the browser
paints it immediately. LegoDOM then takes over on the client.

::: warning Hydration is the next phase
Today the client does **not** adopt server rendered markup. When `Lego.init()`
reaches a block host it clears the shadow root and renders the block from
scratch, exactly as it would for an empty tag. You get the faster first paint
and the crawler-visible HTML; you do not yet get a preserved DOM. The output
contract below is fixed, and the hydration engine that consumes it lands next.
:::

## Quick start

```js
import { createRenderer } from 'lego-dom/server';
import fs from 'node:fs';

const renderer = createRenderer();

renderer.defineLegoFile(fs.readFileSync('./blocks/user-card.lego', 'utf8'), 'user-card.lego');

const html = renderer.renderToString('user-card', {
  props: { name: 'Ada' }
});
```

## API

### `createRenderer(options?)`

Creates a renderer. Renderers are independent: definitions, delimiters and the
sanitizer belong to the renderer, so one process can serve several.

| Option | Type | Description |
|--------|------|-------------|
| `syntax` | `'brackets' \| 'mustache'` | Interpolation delimiters. Defaults to `Lego.config.syntax`. |
| `sanitize` | `(html, blockName) => string` | Replaces the built-in `b-html.safe` sanitizer. Point it at DOMPurify for production. |

### `renderer.define(tagName, definition)`

| Field | Type | Description |
|-------|------|-------------|
| `template` | `string` | The block's markup. |
| `logic` | `object` | State, getters and methods. |
| `styles` | `string` | CSS text for the block's `<style>`. |
| `shadow` | `boolean` | `false` renders into the host's light DOM. Defaults to `true`. |
| `props` | `string \| string[]` | Declared prop names, in `b-props` syntax or as an array. |

Block names must contain a hyphen, the same rule custom elements follow.

```js
renderer.define('user-card', {
  template: '<div class="card"><h2>[[ name ]]</h2><slot></slot></div>',
  styles: 'self { display: block } .card { padding: 1rem }',
  logic: { name: 'anon' },
  props: '{ name }'
});
```

::: tip `styles` is CSS, not a stylesheet list
On the client, `Lego.block()`'s `styles` argument is a `b-stylesheets` list.
Here it is the CSS text itself, matching the `<style>` section of a `.lego`
file. See [Style scoping](#style-scoping) for what happens to it.
:::

### `renderer.defineLegoFile(source, filename?)`

Registers a block from `.lego` source, using the same `parseLego` the client
and the Vite plugin use. The block name comes from the filename.

```js
renderer.defineLegoFile(source, 'UserCard.lego'); // registers "user-card"
```

Add `b-shadow="false"` to the `<template>` tag to render the block into light
DOM instead of a shadow root.

### `renderer.renderToString(tagName, options?)`

| Option | Type | Description |
|--------|------|-------------|
| `props` | `object` | Merged over the block's logic defaults. |
| `globals` | `object` | What templates read as `global`. |
| `route` | `object` | What `$route` and `$params` return. |
| `slots` | `Record<string, string>` | Slot content, as HTML. `default` fills the unnamed slot. |
| `attrs` | `object` | Extra attributes on the host element. `true` writes a valueless one. |

```js
const html = renderer.renderToString('user-card', {
  props: { name: 'Ada' },
  globals: { user: { id: 1 } },
  route: { url: '/u/1', params: { id: '1' }, query: {} },
  slots: { default: '<p>hi</p>', header: '<b>title</b>' },
  attrs: { class: 'card' }
});
```

`renderer.has(name)` and `renderer.names()` round out the surface.

## The output contract

### Hosts

Every block host carries `b-hydrate` and `b-id="tag-name"`, after whatever
attributes the author or the caller supplied.

### Shadow blocks (the default)

The host holds a declarative shadow root: a `<template shadowrootmode="open">`
containing the block's `<style>` first, if it has one, then the rendered
template. Anything the caller passed as slot content follows that template
element as ordinary light children, where the browser projects it.

```html
<user-card class="card" b-hydrate b-id="user-card">
  <template shadowrootmode="open">
    <style>:host { display: block }</style>
    <div class="card"><h2>Ada</h2><slot></slot></div>
  </template>
  <p>hi</p>
  <b slot="header">title</b>
</user-card>
```

`<slot>` elements stay in the template: projection is the browser's job.
Named slot HTML given through the `slots` option is stamped with
`slot="name"` on its top-level elements, so the map key does the naming for
you.

### Light DOM blocks

`b-shadow="false"` on the `<template>`, or `shadow: false` in a definition,
puts the rendered template straight into the host. `<slot>` elements are
substituted here rather than emitted: content the caller assigned to a slot
replaces it, and a slot with nothing assigned renders its own children as
fallback. The `<slot>` wrapper is never emitted.

```html
<page-layout b-hydrate b-id="page-layout">
  <style data-lego-style="page-layout">page-layout .row { display: flex }</style>
  <header><b>title</b></header>
  <main><p>hi</p></main>
</page-layout>
```

### Style scoping

A shadow block's styles only need the rewrite `snap()` does at mount: the
`self` selector becomes `:host`, and the shadow root handles the rest.

A light DOM block has no such boundary, so its styles are scoped the same way
the client scopes them, and the two agree:

- every top-level selector is prefixed with the block's tag name, each entry
  in a selector list separately, so `.a, .b > p` becomes
  `tag-name .a, tag-name .b > p`
- a selector naming `self` already says where it starts, so `self` becomes the
  bare tag name rather than picking up a second, redundant prefix
- `@media`, `@supports`, `@container` and `@layer` blocks are recursed into
- `@keyframes`, `@font-face` and every other at-rule whose body is not a rule
  list are left alone, since prefixing a keyframe selector would break the
  animation
- strings and comments are untouched, so `content: "self"` survives

The `<style>` element carries `data-lego-style="tag-name"`. Those rules are
global and every instance of the block emits the same ones, so the client uses
the marker to keep exactly one.

### Directive markers

| Directive | Server output |
|-----------|---------------|
| `b-if` false | `<!--b-if: EXPR-->` in place of the element, expression verbatim |
| `b-if` true | the element, unchanged |
| `b-for` | `<!--b-for: item in list-->` then one clone per item |
| `b-show` false | `display: none` appended to the inline style |
| `b-text` | escaped text content |
| `b-html` | raw insertion |
| `b-html.safe` | insertion through the sanitizer |
| `b-sync` | `value`, or `checked` on a checkbox or radio |
| `b-mount` | the named block rendered as the element's content |
| `b-init`, `b-enter`, `b-leave`, `@event` | emitted as authored, never executed |

**Nothing is stripped.** Every `b-`, `@` and `:` attribute survives exactly as
the author wrote it, because the client re-scans them when it takes over.
Interpolation inside an attribute value is applied, so `class="card [[ tone ]]"`
arrives as `class="card warm"`.

### Loop keys

Each `b-for` clone keeps its `b-for` and `b-key` attributes and gains
`data-b-key`, the key the client computes for that row:

1. the `b-key` path resolved on the item
2. otherwise `id`, `_id`, `uuid` or `key`
3. otherwise, for a primitive, `index-value`
4. otherwise the index

The client's own last resort is object identity through a WeakMap, which no
server can know. **Lists of keyless objects therefore rehydrate by position.**
Give such lists a `b-key` if their order can change.

### Nested blocks

An element whose tag names a registered block is rendered recursively, with
its own state. Props are layered from four sources, later winning:

1. the child block's own logic defaults
2. its `b-logic` attribute, evaluated against the **parent's** scope
3. plain attributes whose name matches a declared prop, as strings
4. `:prop="expr"` expressions, evaluated against the parent's scope

So a bound `:prop` beats a plain attribute of the same name. Prop names go
from kebab-case to camelCase, and `:display-name` sets `displayName`. Both
attributes are still emitted as authored.

Children written inside a block tag are the caller's slot content. They belong
to the parent, so they are rendered in the parent's scope before the child
block sees them, exactly as the browser projects light DOM into a shadow root.

## What runs, and what does not

State for a render is a plain object: the block's logic, then the props layered
over it. Getters run on read, with `this` bound to that object, so a getter
reading other state works. Methods are callable from expressions, also with
`this` bound to state.

`mounted`, `updated` and `unmounted` are **never called**. They land on state
like any other key and are ignored. Anything a block needs in order to render
has to be in its logic or arrive as a prop, not be fetched in `mounted()`.

::: warning Definition logic is shared across renders
Props are layered onto a fresh object each render, but the copy is shallow, so
a nested object or array in a block's `logic` is the *same* object on every
request. The renderer never writes to state; a method your template calls
could. Treat a definition's logic as read-only, and pass per-request data in
through `props`.
:::

Expressions go through the same compiler the browser uses, so identifier
resolution is identical: helpers first, then state, then `global` / `self` /
`event`, then the safe global allowlist. `document`, `window` and `fetch` are
not reachable, here as there.

These helpers exist so a template that names them renders instead of throwing:

| Helper | Server behaviour |
|--------|------------------|
| `$route`, `$params` | the `route` you passed to `renderToString` |
| `$element` | `null` |
| `$emit`, `$go` | no-ops |
| `$db(key)` | returns `{ get: () => null }` |
| `$ancestors`, `$registry`, `$mount` | return `undefined` |

An expression that names something undefined renders as an empty string, the
same as the client outside strict mode. Any other error propagates to you,
carrying the block name and the expression:

```
[Lego SSR] <user-card>: failed evaluating "user.name": Cannot read properties of null
```

Block composition stops at 32 levels deep. Past that the host is emitted empty,
still wearing `b-hydrate`, and the client fills it in.

## `.lego` script sections are executed

`defineLegoFile` evaluates the `<script>` section's default export with
`new Function`, exactly as the browser runtime does. **This is code the block
author wrote, running on the author's own server**, from a file the author's
build put on disk. It is not user input, and it must never be built from user
input. If your server assembles `.lego` source at request time, JSON-encode
every value you splice into it (see [Server Side Blocks](/tutorial/server-side)
for the same warning on the client side).

Only the default exported object literal is evaluated, so `import` statements
in a script section are not supported. `$db` is passed in as an inert stub.

Template expressions never take this path. They are compiled to closures by
LegoDOM's own parser, with no `new Function` anywhere near them.

## Express example

```js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createRenderer } from 'lego-dom/server';

const renderer = createRenderer();

// Register every block once, at boot.
for (const file of fs.readdirSync('./blocks')) {
  if (!file.endsWith('.lego')) continue;
  renderer.defineLegoFile(fs.readFileSync(path.join('./blocks', file), 'utf8'), file);
}

const app = express();

app.get('/u/:id', (req, res) => {
  const user = db.users.find(req.params.id);

  const body = renderer.renderToString('user-card', {
    props: { name: user.name, balance: user.balance },
    globals: { theme: 'dark' },
    route: { url: req.originalUrl, params: req.params, query: req.query }
  });

  res.send(`<!DOCTYPE html>
<html>
  <head><title>${user.name}</title></head>
  <body>
    ${body}
    <script type="module">
      import Lego from '/lego.mjs';
      Lego.init(document.body, { loader: (tag) => \`/blocks/\${tag}.lego\` });
    </script>
  </body>
</html>`);
});
```

Definitions are immutable once registered and nothing is cached per request, so
a single renderer is safe to share across concurrent requests.

## Known gaps

- **Hydration.** The client re-renders on mount. Next phase.
- **`<select b-sync>`.** The server does not mark the matching `<option>`
  as selected. On the client `b-sync` runs in a late phase precisely because a
  select's options are often produced by a `b-for` that has to run first. The
  client sets the selection on mount.
- **Light DOM blocks.** The shipped browser runtime always attaches a shadow
  root, so `b-shadow="false"` is server-side only until the client half lands.
  The style scoping above matches what the client will apply.

## Next steps

- [Server Side Blocks](/tutorial/server-side) for fetching blocks on demand
- [Slots & Content Projection](/tutorial/slots) for the slot model
- [Directives](/tutorial/directives) for the full directive reference
