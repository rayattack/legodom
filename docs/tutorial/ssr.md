# Server-Side Rendering

`lego-dom/server` renders blocks to HTML strings in Node. It is a separate
package entry with its own build, so importing it never pulls the browser
runtime, the DOM, or any dependency into your server.

```js
import { createRenderer } from 'lego-dom/server';
```

The point is a first paint that does not wait for JavaScript. The server
produces real markup, including a declarative shadow root, and the browser
paints it immediately. LegoDOM then **hydrates** it on the client: it adopts
the nodes that are already there instead of replacing them, so a page the
server rendered correctly reaches interactivity without a single DOM write.

See [Hydration](#hydration) for what the client does with this output, and
[The round trip](#the-round-trip) for registering one set of blocks and using
it on both sides.

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
| `definitions` | app \| object \| Map | Blocks to register up front. See [The round trip](#the-round-trip). |

### `renderer.defineFrom(source)`

The `definitions` option, for a renderer that already exists. `source` is a
LegoDOM app, or what `Lego.getDefinitions()` returns, or a Map, or any plain
object keyed by tag name.

```js
createRenderer().defineFrom(Lego);
```

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
server can know, so **a list of keyless objects cannot be adopted**: the client
computes different keys, builds fresh rows and drops the server's. Everything
still renders correctly, it just costs the DOM work hydration exists to avoid.
Give any server rendered list a `b-key`.

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

## Hydration

`Lego.init()` treats a host carrying `b-hydrate` as markup to take over rather
than markup to replace. Nothing is cloned and nothing is wiped:

1. A shadow block's `<template shadowrootmode="open">` becomes its shadow root
   (see [Older browsers](#older-browsers)); a light DOM block's own children
   are already its render root.
2. The block's bindings are built by walking the live tree and the block's
   `<template>` side by side, pairing nodes by position. Each binding takes its
   node from the page and its `[[ ]]` source from the template, which is the
   only place that source still exists.
3. `b-hydrate` is removed and the block renders. Every binding runs, so every
   effect is created and the block is fully reactive from the first frame.

### Nothing is written to a correct page

That first render runs every binding, but each one compares before it writes:
text only when the content differs, an attribute only when the value differs,
`b-show` only when the visibility differs, a `b-for` row only when it moved.
A page whose markup already agrees with its state therefore produces **zero DOM
writes**, and the nodes the server painted are the nodes the user keeps
interacting with.

State that has moved on since the server rendered is corrected on that same
first render, so a stale value costs one write and nothing else.

### Markers become anchors

The client creates a comment anchor for `b-if` and `b-for` so it knows where to
put things back. The server writes those anchors itself, and hydration adopts
them rather than making new ones:

| Server output | What hydration does |
|---------------|---------------------|
| `<!--b-if: EXPR-->` | Clones the element out of the template and makes the comment its anchor, so the first toggle swaps it in exactly where the server left the gap. |
| the `b-if` element | Scans it in place, as any other element. |
| `<!--b-for: item in list-->` | Becomes the loop's anchor. |
| a row carrying `data-b-key` | Adopted into the loop's pool under that key, with its scope, its own bindings and its event listeners. `data-b-key` is removed. |

Because rows are adopted by key, editing one item after hydration updates the
element the server rendered rather than replacing it, and reordering the list
moves those same elements.

### Mismatches fall back, one block at a time

If the live tree and the template diverge structurally (a different tag at a
position, a node the template does not describe, a missing anchor) the block
logs one warning naming itself and renders from its template as though the
server had sent nothing:

```
[Lego] Hydration mismatch in <user-card>: the template has <h2> where the
server rendered <h3>. Rendering this block from its template instead.
```

The page is still correct; only the DOM saving is lost, and only for that
block. Its parents, siblings and children hydrate normally.

The usual cause is the server and the client disagreeing about a definition,
which is what [The round trip](#the-round-trip) is for.

### Older browsers

Every browser that supports declarative Shadow DOM turns
`<template shadowrootmode="open">` into a real shadow root while it parses, well
before any script runs. Where it does not, the runtime does the same conversion
itself when it reaches the host: it attaches the shadow root, moves the
template's content in, and removes the template. Both paths land in the same
place, so no polyfill is needed.

### Registration order

A parent binds `:prop="expr"` on a child tag only if the child block is already
registered when the parent is scanned, hydrating or not. Register child blocks
before their parents, or register everything before the markup that uses it
reaches the page.

### What hydration does not adopt

- **`b-html`, `b-text` and `b-mount`** own their element's content outright.
  The server wrote the result and the template holds the expression, so there
  is nothing to pair inside them: the directive rebuilds that subtree on the
  first render.
- **Light DOM blocks with slot content.** The server substitutes slots itself,
  so the caller's nodes end up nested inside the child's rendered template and
  the two shapes no longer line up. Those blocks report a mismatch and
  re-render. Shadow blocks (the default) are unaffected: their `<slot>`
  elements survive into the shadow root on both sides.
- **Keyless object lists**, as described under [Loop keys](#loop-keys).

## The round trip

`Lego.block()` and `Lego.defineLegoFile()` touch no DOM. The block's
`<template>` is built the first time a block mounts, and the custom element is
only defined where `customElements` exists, so a module of block definitions
imports cleanly into a bare Node process. (`Lego.init()` still needs a
document; it is the browser half.)

`Lego.getDefinitions()` hands those definitions to the server renderer in the
shape `define()` wants, so one module is the single source of truth for both
sides and there is nothing for the two to disagree about.

`blocks.js`, imported by the server and shipped to the browser:

```js
import Lego from 'lego-dom';

Lego.block('user-card', {
  template: '<div class="card"><h2 title="[[ name ]]">[[ name ]]</h2><slot></slot></div>',
  logic: { name: 'anon' },
  props: '{ name }'
});

export default Lego;
```

On the server:

```js
import Lego from './blocks.js';
import { createRenderer } from 'lego-dom/server';

const renderer = createRenderer({ definitions: Lego.getDefinitions() });
// or: createRenderer().defineFrom(Lego);

const body = renderer.renderToString('user-card', { props: { name: 'Ada' } });

res.send(`<!DOCTYPE html>
<html>
  <head><title>Ada</title></head>
  <body>
    ${body}
    <script type="module" src="/blocks.js"></script>
    <script type="module">
      import Lego from './blocks.js';
      Lego.init();
    </script>
  </body>
</html>`);
```

The browser paints `<user-card>` before that module arrives. When it does,
`init()` finds the `b-hydrate` host, adopts the shadow root the parser built,
and takes over without touching a node.

A `.lego` file works the same way, on both sides:

```js
const source = fs.readFileSync('./blocks/user-card.lego', 'utf8');
Lego.defineLegoFile(source, 'user-card.lego');    // Node or browser
```

`getDefinitions()` returns the block's `<style>` section as `styles`, so the
server scopes it exactly as the client would and a light DOM block's
`<style data-lego-style="…">` is the same CSS either way. On the client, a
hydrated light DOM block moves that element into `<head>` as it stands rather
than injecting a second, doubly-prefixed copy.

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

The script runs as a function body: top-level helpers and constants work, and
an `import` statement throws, since there is no bundler on this path to
resolve it. For blocks whose scripts import modules, load them through Vite's
`ssrLoadModule`, which runs the same `.lego` plugin as the browser build, and
hand `Lego.getDefinitions()` to `createRenderer`. `Lego` and `$db` are passed
in as inert stubs.

Template expressions never take this path. They are compiled to closures by
LegoDOM's own parser, with no `new Function` anywhere near them.

## Express example

```js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import Lego from 'lego-dom';
import { createRenderer } from 'lego-dom/server';

// Register every block once, at boot. Registering through the client API
// means the browser bundle can import this very module and hydrate what this
// renderer produced. See The round trip above.
for (const file of fs.readdirSync('./blocks')) {
  if (!file.endsWith('.lego')) continue;
  Lego.defineLegoFile(fs.readFileSync(path.join('./blocks', file), 'utf8'), file);
}

const renderer = createRenderer().defineFrom(Lego);

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
      // The same blocks, registered the same way, so the client hydrates
      // this markup instead of re-rendering it.
      import Lego from '/blocks.js';
      Lego.init();
    </script>
  </body>
</html>`);
});
```

Definitions are immutable once registered and nothing is cached per request, so
a single renderer is safe to share across concurrent requests.

## Known gaps

- **`<select b-sync>`.** The server does not mark the matching `<option>`
  as selected. On the client `b-sync` runs in a late phase precisely because a
  select's options are often produced by a `b-for` that has to run first. The
  client sets the selection on mount, so a hydrated select costs one write.
- **Light DOM blocks with slot content**, and **keyless object lists**, and
  the three content directives: see
  [What hydration does not adopt](#what-hydration-does-not-adopt).

## Next steps

- [Server Side Blocks](/tutorial/server-side) for fetching blocks on demand
- [Slots & Content Projection](/tutorial/slots) for the slot model
- [Directives](/tutorial/directives) for the full directive reference
