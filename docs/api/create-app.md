# Lego.createApp()

Creates an independent LegoDOM application instance: its own config, globals, routes, `$registry` states and plugins.

```ts
Lego.createApp(options?: CreateAppOptions): LegoApp
```

The default `Lego` export **is** an app, created with the default config. Everything on this page is true of `Lego` itself, and a page that never calls `createApp()` behaves exactly as it always has.

```js
import Lego, { createApp } from 'lego-dom';

const admin = createApp({
  config: { syntax: 'mustache', strict: true },
  globals: { role: 'admin' }
});

admin.block('admin-panel', '<h1>{{ global.role }}</h1>');
await admin.init(document.body, { routerTarget: '#admin-outlet' });
```

## Why

`registry`, `routes`, `config` and `globals` used to be module singletons. Two LegoDOM apps on one page shared routes and globals, and collided on config such as the delimiter syntax and `strict`, so blocks written against different conventions could not coexist. An app instance draws the boundary: every block remembers which app defined it, and the runtime resolves delimiters, strict mode, globals, routes and `onError` through that app.

## Parameters

### `options.config`

Merged over a **fresh copy** of the default config. Every field of [`Lego.config`](/api/config) is accepted: `syntax`, `strict`, `debug`, `onError`, `sanitize`, `loaderAllowlist`, `metrics`, `loader`.

```js
const legacy = createApp({ config: { syntax: 'mustache' } });
const modern = createApp();              // '[[ ]]', the default

legacy.block('legacy-card', '<p>{{ title }}</p>', { title: 'Old' });
modern.block('modern-card', '<p>[[ title ]]</p>', { title: 'New' });
```

Both blocks render correctly on the same page. `metrics` is a fresh object per app, so a monitoring plugin installed on one app never reports the other's renders.

### `options.globals`

Seeds the app's reactive globals. The app always also gets `$route`, `$go`, `$mount` and `$db`.

```js
const shop = createApp({ globals: { cart: [], currency: 'EUR' } });
shop.globals.currency = 'USD';   // re-renders only blocks that read it
```

Globals are per app. Mutating `appA.globals.x` wakes the bindings in app A's blocks and nothing in app B.

`$db` is deliberately shared: `localStorage` is one store per origin, and a key persisted by one app is the same key for the other.

## The app object

| Member | Notes |
|---|---|
| `app.block(tag, …)` | Same two call shapes as [`Lego.block`](/api/block). The block belongs to this app. |
| `app.defineLegoFile(content, filename?)` | Define from `.lego` source, against this app. |
| `app.route(path, tag, middleware?)` | Registers on **this app's** route table. |
| `app.init(root?, options?)` | Same as [`Lego.init`](/api/init), plus `routerTarget`. |
| `app.use(plugin, options?)` | Install a plugin against this app. |
| `app.globals` | This app's reactive globals. |
| `app.config` | This app's config object. |
| `app.mount` / `app.snap` / `app.unsnap` / `app.db` | The shared imperative helpers. |
| `app.nextTick()` | Awaits the next render flush. One batcher serves every app. |
| `app.effect(fn)` / `app.watch(source, cb, options?)` | Reactive helpers, resolved against this app's globals. |
| `app.getLegos()` | The block names **this app** defined. |
| `app.getActiveBlocksCount()` | Mounted blocks on the page, all apps included. |
| `app.createApp(options?)` | The factory again, so one import is enough. |

## Tag names are global

Custom element names belong to the document, not to an app: `customElements.define` accepts a name once per page. So the first app to define a tag owns it, and a second app asking for the same name is warned and ignored.

```js
appA.block('user-card', '<span>A</span>');
appB.block('user-card', '<span>B</span>');
// [Lego] <user-card> is already defined by another app. …
// <user-card> keeps app A's definition.
```

This is a platform constraint. Prefix the tags of an app that may share a page with another (`admin-user-card`, `shop-user-card`).

## Routing side by side

Document level `popstate`, `click` and `submit` listeners are installed once, and every initialized app is asked to match the new URL. Each app matches against its own routes and renders into its own target, so one navigation can update two regions of the page with different blocks.

```js
appA.route('/dashboard', 'sales-dashboard');
appB.route('/dashboard', 'ops-sidebar');

await appA.init(document.body, { routerTarget: '#main' });
await appB.init(document.body, { routerTarget: '#sidebar' });
```

`routerTarget` is a selector (or `#id`), and defaults to `<lego-router>`. A link's `b-target` still wins over it.

A click pushes history exactly once however many apps are listening, so the two apps share one history stack.

`$go()` called from inside a block navigates through **that block's** app: it consults that app's routes and, with no explicit target, renders into that app's `routerTarget`. Other apps do not hear about a programmatic navigation.

## Plugins

```js
const Analytics = {
  install(app, options) {
    const original = app.config.onError;
    app.config.onError = (err, type, el) => {
      options.report(err);
      original(err, type, el);
    };
  }
};

app.use(Analytics, { report: send });
app.use(Analytics, { report: send });   // no-op: once per app per plugin
```

A plugin is either an object with an `install(app, options)` method or a plain `function (app, options)`. `use()` returns the app, so calls chain. The same plugin object installed on two apps is installed twice, once per app, each time receiving that app.

The bundled monitoring plugin works either way:

```js
import { Monitoring } from 'lego-dom/plugins/monitoring';

Lego.use(Monitoring);          // preferred
Monitoring.install(Lego);      // still supported
```

## What is shared

Some things are per document by nature and stay shared between apps:

- `customElements` and therefore the tag name space.
- The render batcher and its frame, so `nextTick()` on either app awaits the same flush.
- The expression compile cache and the dependency graph, both keyed by identity.
- `activeBlocks`, so `getActiveBlocksCount()` counts every mounted block.
- `$db` / `localStorage`, and the stylesheet registry that `init({ styles })` fills.
