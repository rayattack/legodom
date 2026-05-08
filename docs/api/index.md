# API Reference

Exhaustive surface area of the `Lego` runtime. Every entry on this page maps directly to source under `src/`. If something isn't here, it isn't part of the public API.

## Runtime

| Symbol | Purpose |
|---|---|
| [`Lego.init(root?, options?)`](/api/init) | Boot the engine. Discover templates, hydrate inline blocks, install router & loader, run startup-time route match. |
| [`Lego.block(tag, html, logic?, styles?, cascade?, error?, props?)`](/api/block) | Define a block from a string template. |
| [`Lego.defineLegoFile(content, filename?)`](/api/block#lego-definelegofile) | Define a block from `.lego` SFC content (used by the Vite plugin and runtime loaders). |
| [`Lego.route(path, tagName, middleware?)`](/api/route) | Register a client-side route. Supports `:params`, `*` wildcards, and async middleware. |
| [`Lego.snap(el)` / `Lego.unsnap(el)`](/api/advanced#lego-snap) | Manually mount / unmount a block element. |
| [`Lego.mount(tag, target?, props?)`](/api/advanced#lego-mount) | Imperative mount with optional initial state. |
| [`Lego.db(key)`](/api/advanced#lego-db) | Persistence descriptor builder (also exposed as `$db` inside blocks). |
| [`Lego.getLegos()` / `Lego.getActiveBlocksCount()`](/api/advanced#introspection) | Introspection helpers. |
| [`Lego.debug.stylesheets(el)`](/api/advanced#debug) | Inspect resolved stylesheets for a block. |

## Reactive globals

| Symbol | Purpose |
|---|---|
| [`Lego.globals`](/api/globals) | Reactive cross-block state. Mutating any property re-renders subscribed blocks. |
| [`Lego.globals.$route`](/api/globals#route) | Current `{ url, route, params, query, method, body }`. |
| [`Lego.globals.$go(path, ...targets)`](/api/globals#go) | Programmatic navigation. Returns `{ get, post, put, patch, delete }`. |
| [`Lego.globals.$mount`](/api/globals#mount) | Imperative mount helper (alias of `Lego.mount`). |
| [`Lego.globals.$db`](/api/globals#db) | Persistence factory (alias of `Lego.db`). |

## Configuration

| Symbol | Purpose |
|---|---|
| [`Lego.config.syntax`](/api/config#syntax) | Delimiter style, `'brackets'` (`[[ ]]`, default) or `'mustache'` (`{{ }}`). |
| [`Lego.config.debug`](/api/config#debug) | Verbose tracing. |
| [`Lego.config.onError`](/api/config#onerror) | Last-resort error handler when no boundary catches. |
| [`Lego.config.sanitize`](/api/config#sanitize) | HTML sanitizer used by `b-html.safe`. |
| [`Lego.config.metrics`](/api/config#metrics) | `onRenderStart` / `onRenderEnd` hooks. |
| [`Lego.config.loader`](/api/config#loader) | Auto-discovery loader for unknown hyphenated tags. |
| [`Lego.config.loaderAllowlist`](/api/config#loaderallowlist) | Tag-name allowlist for the loader. |

## Block surface

Inside a block's logic (`mounted`, methods, getters), `this` exposes:

| Symbol | Purpose |
|---|---|
| `this.$element` | The host element. |
| `this.$vars` | DOM refs collected via `b-var`. |
| `this.$parent` | Nearest ancestor block. |
| `this.$emit(name, detail?)` | Dispatch a `bubbles: true, composed: true` `CustomEvent`. |
| `this.$route`, `this.$go`, `this.$mount` | Mirror of the reactive globals. |
| `this.mounted()` / `this.updated()` / `this.unmounted()` | [Lifecycle hooks](/api/lifecycle). |

Inside template expressions (`[[ … ]]`, `@event="…"`, `b-if/b-show/b-html/b-mount`), the scope adds:

| Symbol | Purpose |
|---|---|
| `state` | The block's own state (default scope of every expression). |
| `global` | Reactive globals, read `global.user.name`, etc. |
| `self` | The DOM node the binding is on. |
| `event` / `$event` | The DOM event (event handlers only). |
| `$ancestors(tag)` | Find the nearest matching block ancestor. |
| `$registry(tag)` | Reactive shared state for a registered block tag. |
| `$params` | Shortcut for `$route.params`. |
| `$go`, `$mount`, `$db`, `$emit`, `$element` | Same as the JS-side helpers. |

## Directives

The complete set, all defined under `src/directives/`:

| Directive | Effect |
|---|---|
| [`b-if`](/api/directives#b-if) | Conditional mount/unmount. |
| [`b-show`](/api/directives#b-show) | Toggle inline `display`. |
| [`b-for`](/api/directives#b-for) | Keyed list rendering. |
| [`b-text`](/api/directives#b-text) | Path-only text binding. |
| [`b-html`](/api/directives#b-html) / `b-html.safe` | Raw HTML, optionally sanitized. |
| [`b-sync`](/api/directives#b-sync) / `.lazy` `.number` `.trim` | Two-way form binding. |
| [`b-init`](/api/directives#b-init) | One-shot expression. |
| [`b-enter`](/api/directives#b-enter) / `.once` | IntersectionObserver entry hook. |
| [`b-leave`](/api/directives#b-leave) / `.once` | IntersectionObserver exit hook. |
| [`b-mount`](/api/directives#b-mount) | Reactively mount a tag computed from state. |
| [`b-var`](/api/directives#b-var) | Capture DOM refs into `$vars`. |
| [`b-logic` / `b-data`](/api/directives#b-logic) | Inject state at template or instance level. |
| [`b-props`](/api/directives#b-props) | Declared prop contract. |
| [`b-id`](/api/directives#b-id) | Inline-template tag name. |
| [`b-error`](/api/directives#b-error) | Error boundary fallback tag. |
| [`b-stylesheets`](/api/directives#b-stylesheets) / [`b-cascade`](/api/directives#b-cascade) | Adopt named constructable stylesheets. |
| [`b-target`](/api/directives#b-target) / [`b-link`](/api/directives#b-link) / [`b-action`](/api/directives#b-action) | Routing attributes on `<a>` / `<form>`. |

## Browser support

LegoDOM relies on:

- Custom Elements v1 + Shadow DOM v1
- ES6 `Proxy`
- `IntersectionObserver` (only consumed by `b-enter` / `b-leave`)
- `CSSStyleSheet` constructable + `adoptedStyleSheets` (used by `b-stylesheets`)

Tested in Chrome 90+, Firefox 90+, Safari 15+, Edge 90+. The directives that need `IntersectionObserver` and constructable stylesheets degrade gracefully on older browsers, neither throws, but the affected feature won't run.
