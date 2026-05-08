# Lego.init()

Boots the engine. Until you call `init()`, reactivity, routing, and auto-discovery do not run, and any `<template b-id>` declared in HTML is not registered.

```ts
Lego.init(root?: HTMLElement, options?: InitOptions): Promise<void>
```

## Parameters

### `root`

- **Type**: `HTMLElement`
- **Default**: `document.body`

The element under which to scan for `<template b-id>` definitions and run loader auto-discovery. If you pass anything that isn't an element, `init` falls back to `document.body`.

### `options`

```ts
interface InitOptions {
  styles?: Record<string, (string | CSSStyleSheet)[]>;
  loader?: (tagName: string) => string | Promise<string> | void;
  manifest?: ManifestGroup | ManifestGroup[] | string | { url: string; headers?: Headers; credentials?: RequestCredentials };
  studio?: boolean;
  debug?: boolean;
}
```

#### `options.styles`

Map of stylesheet keys to either URLs (fetched and converted to `CSSStyleSheet`) or pre-constructed `CSSStyleSheet` instances. Each key becomes addressable through `b-stylesheets="key"` and `b-cascade="key"`.

```js
await Lego.init(document.body, {
  styles: {
    base: ['/styles/reset.css', '/styles/typography.css'],
    forms: ['/styles/forms.css']
  }
});
```

```html
<template b-id="signup-form" b-stylesheets="base forms">
  <form>…</form>
</template>
```

Stylesheets are pre-loaded in parallel and adopted via `Document.adoptedStyleSheets`. After loading, every block already on the page that names one of these keys is reapplied, order-of-init doesn't matter.

#### `options.loader`

Auto-discovery hook for unknown hyphenated tags. Whenever the runtime sees a custom-element tag with no registered template, it calls `loader(tagName)`.

```js
await Lego.init(document.body, {
  loader: (tag) => `/blocks/${tag}.lego` // shorthand: return a URL
});
```

The loader can return:

- `string`, treated as a URL; the runtime fetches it and parses the response body as a `.lego` SFC.
- `Promise<string>`, the resolved string is parsed as a `.lego` SFC. Use this when you need custom headers, credentials, or auth.
- `null` / `undefined`, no fetch is attempted for that tag.

::: warning Lock the loader down
A loader without an allowlist will fetch any unknown hyphenated tag a third party can inject. Always set `Lego.config.loaderAllowlist` in production. See [`config.loaderAllowlist`](/api/config#loaderallowlist).
:::

#### `options.manifest`

Pre-register a batch of remote `.lego` blocks before users navigate. Three shapes are accepted:

```js
// 1. Array form (most common)
manifest: [
  {
    base: '/blocks/',
    suffix: true,                       // appends '.lego'
    legos: ['user-card', 'app-nav']     // -> /blocks/user-card.lego
  },
  {
    base: '/widgets/',
    map: { 'date-picker': 'pickers/date.lego' }
  }
]

// 2. URL form, manifest fetched from a public endpoint
manifest: '/blocks/manifest.json'

// 3. Authenticated form
manifest: {
  url: '/api/manifest',
  credentials: 'include',
  headers: { Authorization: () => `Bearer ${token}` } // function or static
}
```

For each entry the runtime registers a custom element that, on first connect, fetches the file, parses it via `Lego.defineLegoFile()`, and snaps the live element. While the fetch is in-flight, additional instances are queued and snapped when the response lands, so a list of 50 `<user-card>` elements triggers exactly one network round-trip.

Header values may be functions (called per-fetch) or strings. Strings prefixed `$db.` resolve through the persistence layer; strings prefixed `$globals.` read from `Lego.globals`.

#### `options.studio`

When `true`, side-loads `@legodom/studio` from the unpkg CDN and registers `/_/studio` and `/_/studio/:block` routes. Useful for in-app component browsing during development.

#### `options.debug`

Enables verbose `[Lego Trace]` logging. Equivalent to `Lego.config.debug = true`.

## What `init()` actually does

In order:

1. Stamps `config.loader`, `config.debug`, and the styles map.
2. Awaits stylesheet preload (parallel `fetch` + `CSSStyleSheet.replace`).
3. If routes are registered, performs an initial route match against `window.location` so `$route` is correct on first paint.
4. Registers every `<template b-id>` under `root` as a custom element.
5. Resolves and registers the manifest, if any.
6. If a `loader` is provided, walks `root` for unknown hyphenated tags and starts a `MutationObserver` to catch later insertions.
7. Wires up `popstate`, `<a b-link|b-target>` click delegation, and `<form b-action>` submit prevention.
8. Calls `initCrossTabSync()` to bind a single `storage` listener for `$db` cross-tab updates.

Step 4 means inline templates are upgraded **after** routes are matched, useful when you want a route to render before declarations are scanned.

## Examples

### Plain CDN

```html
<template b-id="hello-world">
  <h1>Hello [[ name ]]!</h1>
</template>

<hello-world b-logic="{ name: 'World' }"></hello-world>

<script src="https://unpkg.com/lego-dom"></script>
<script>Lego.init();</script>
```

### Vite app with stylesheets and routing

```js
// src/app.js
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

Lego.route('/',          'home-page');
Lego.route('/users/:id', 'user-page');
Lego.route('*',          'not-found');

await Lego.init(document.body, {
  styles: {
    base: ['/styles/reset.css', '/styles/theme.css']
  }
});
```

### Authenticated lazy-loading

```js
await Lego.init(document.body, {
  loader: async (tag) => {
    const res = await fetch(`/api/blocks/${tag}.lego`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) return; // skip this tag
    return res.text();
  }
});

Lego.config.loaderAllowlist = /^app-/; // only fetch app-* tags
```
