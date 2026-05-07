# Lego.config

Runtime configuration. Every property has a sensible default — set them directly on `Lego.config` at any point (typically in your app entry, before `Lego.init()`).

```ts
interface LegoConfig {
  syntax:        'brackets' | 'mustache';
  debug:         boolean;
  onError:       (err: Error, type: string, el?: Element) => void;
  sanitize:      ((html: string) => string) | null;
  metrics:       { onRenderStart?: (el) => void; onRenderEnd?: (el) => void };
  loader?:       (tag: string) => string | Promise<string> | void;
  loaderAllowlist?: string | RegExp | Function | (string | RegExp | Function)[] | null;
}
```

## syntax

- **Type**: `'brackets' | 'mustache'`
- **Default**: `'brackets'`

Switches the template delimiter pair globally.

| Setting | Delimiters |
|---|---|
| `'brackets'` | `[[ expr ]]` (recommended — does not collide with frameworks that already use `{{ }}`) |
| `'mustache'` | `{{ expr }}` |

```js
Lego.config.syntax = 'mustache';
```

The setting is read on every render — flipping it after blocks have mounted re-interprets future bindings, but already-resolved text won't reformat until the next render cycle for a given binding.

## debug

- **Type**: `boolean`
- **Default**: `false`

Turns on `[Lego Trace]` and `[Lego Debug]` console logging — render entries, reactive sets, stylesheet application, loader skips. Useful while diagnosing reactivity or scoping issues; noisy in steady state.

```js
Lego.config.debug = true;
// or
await Lego.init(document.body, { debug: true });
```

## onError

- **Type**: `(err: Error, type: string, el?: Element) => void`
- **Default**: logs to `console.error` with the type tag and element

The fallback error handler. Called when an error escapes every [error boundary](/api/directives#b-error). The `type` argument tells you where in the lifecycle the error occurred:

| `type` | Source |
|---|---|
| `'render'` | Template/binding evaluation |
| `'event-handler'` | An `@event="…"` handler |
| `'mounted'` / `'unmounted'` | Lifecycle hooks |
| `'sync-update'` | A `b-sync` write |
| `'define'` | `Lego.block()` registration |
| `'script'` | `<script>` evaluation in a `.lego` file |
| `'quota'` / `'quota-critical'` | `$db` storage exhaustion |

```js
Lego.config.onError = (err, type, el) => {
  Sentry.captureException(err, { tags: { lego_type: type, tag: el?.tagName } });
};
```

## sanitize

- **Type**: `((html: string) => string) | null`
- **Default**: `null`

User-supplied HTML sanitizer used by `b-html.safe`. When `null`, `b-html.safe` falls back to a small built-in sanitizer that strips:

- Dangerous tags: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>`, `<style>`
- Event-handler attributes (`on*`)
- `javascript:`, `vbscript:`, and `data:text/html` URL schemes

For production, set this to DOMPurify (or equivalent):

```js
import DOMPurify from 'dompurify';
Lego.config.sanitize = (html) => DOMPurify.sanitize(html);
```

The base `b-html` directive (without the `.safe` modifier) **never** sanitizes — only use it on trusted content.

## metrics

- **Type**: `{ onRenderStart?: (el) => void; onRenderEnd?: (el) => void }`
- **Default**: `{}`

Hooks called around each block render. Receive the host element. Use them to wire up performance monitoring; the bundled monitoring plugin (`src/plugins/monitoring.js`) ships with a working implementation.

```js
Lego.config.metrics = {
  onRenderStart(el) { performance.mark(`render-start-${el.id}`); },
  onRenderEnd(el)   { performance.measure(`render-${el.tagName}`, `render-start-${el.id}`); }
};
```

## loader

- **Type**: `(tag: string) => string | Promise<string> | void`
- **Default**: `undefined`

Auto-discovery hook for unknown hyphenated tags. Documented under [`Lego.init({ loader })`](/api/init#options-loader) — the option there sets this property.

The loader runs whenever the runtime sees an unregistered hyphenated tag in `root` (initially via TreeWalker, ongoing via `MutationObserver`).

## loaderAllowlist

- **Type**: `string | RegExp | (tag: string) => boolean | Array<…>`
- **Default**: `null`

Allowlist for the loader. When `null`, every unknown hyphenated tag is fetched — and a one-time console warning is emitted to remind you to lock it down. Set this to one of:

```js
// Single string — exact match
Lego.config.loaderAllowlist = 'app-shell';

// RegExp
Lego.config.loaderAllowlist = /^app-/;

// Function
Lego.config.loaderAllowlist = (tag) => tag.startsWith('app-') || tag === 'shared-modal';

// Array — any-match
Lego.config.loaderAllowlist = ['app-shell', /^widget-/];
```

Tag names that don't pass the allowlist are silently skipped (or logged in `debug` mode). Tags that pass are fetched once — concurrent occurrences of the same tag share the in-flight request.

This protects against attacker-controlled markup (e.g. via `b-html`) introducing a tag whose loader fetch then runs through your auth.

## Putting it together

A typical production config:

```js
import { Lego } from 'lego-dom';
import DOMPurify from 'dompurify';
import * as Sentry from '@sentry/browser';

Lego.config.sanitize = DOMPurify.sanitize;
Lego.config.loaderAllowlist = /^app-/;
Lego.config.onError = (err, type, el) => {
  Sentry.captureException(err, { tags: { lego_type: type, tag: el?.tagName } });
};

await Lego.init(document.body, {
  styles: { base: ['/styles/theme.css'] },
  loader: (tag) => `/blocks/${tag}.lego`
});
```
