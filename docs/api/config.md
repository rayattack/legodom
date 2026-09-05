# Lego.config

Runtime configuration. Every property has a sensible default, set them directly on `Lego.config` at any point (typically in your app entry, before `Lego.init()`).

```ts
interface LegoConfig {
  syntax:        'brackets' | 'mustache';
  debug:         boolean;
  onError:       (err: Error, type: string, el?: Element) => void;
  sanitize:      ((html: string) => string) | null;
  strict:        boolean;
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
| `'brackets'` | `[[ expr ]]` (recommended, does not collide with frameworks that already use `{{ }}`) |
| `'mustache'` | `{{ expr }}` |

```js
Lego.config.syntax = 'mustache';
```

The setting is read on every render, flipping it after blocks have mounted re-interprets future bindings, but already-resolved text won't reformat until the next render cycle for a given binding.

## debug

- **Type**: `boolean`
- **Default**: `false`

Turns on `[Lego Trace]` and `[Lego Debug]` console logging, render entries, reactive sets, stylesheet application, loader skips. Useful while diagnosing reactivity or scoping issues; noisy in steady state.

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

The base `b-html` directive (without the `.safe` modifier) **never** sanitizes, only use it on trusted content.

## strict

- **Type**: `boolean`
- **Default**: `false`

Opt-in stricter runtime safety, off by default so a template typo or an intentionally dynamic URL doesn't change behavior in an app that hasn't asked for it. Turns on two checks:

- **Undefined template variables throw.** By default, `[[ usre.email ]]` (a typo) silently renders as an empty string. With `strict` on, the `ReferenceError` re-throws instead, bubbling to the nearest [error boundary](/api/directives#b-error) (or `config.onError` if there isn't one), so the typo surfaces the first time the page renders instead of shipping a blank field to production.
- **Dangerous-scheme URLs are dropped from URL-sink attributes.** Interpolating into `href`, `src`, `action`, `formaction`, `srcdoc`, `xlink:href`, or `data` normally writes whatever the expression evaluates to, straight through. A value like `javascript:alert(1)` (e.g. reflected from `global.$route.query`) would then render as a live link, the same gap React and Vue have for plain attribute bindings. With `strict` on, a `javascript:`/`vbscript:`/`data:text/html` value on one of those attributes is dropped instead of rendered.

```js
Lego.config.strict = true;
```

Turn this on in development to catch typos early, and consider it in production for apps that render attacker-influenced state (route params/query, user-generated content) into URL attributes.

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

Auto-discovery hook for unknown hyphenated tags. Documented under [`Lego.init({ loader })`](/api/init#options-loader), the option there sets this property.

The loader runs whenever the runtime sees an unregistered hyphenated tag in `root` (initially via TreeWalker, ongoing via `MutationObserver`).

## loaderAllowlist

- **Type**: `string | RegExp | (tag: string) => boolean | Array<…>`
- **Default**: `null`

Allowlist for the loader. When `null`, every unknown hyphenated tag is fetched, and a one-time console warning is emitted to remind you to lock it down. Set this to one of:

```js
// Single string, exact match
Lego.config.loaderAllowlist = 'app-shell';

// RegExp
Lego.config.loaderAllowlist = /^app-/;

// Function
Lego.config.loaderAllowlist = (tag) => tag.startsWith('app-') || tag === 'shared-modal';

// Array, any-match
Lego.config.loaderAllowlist = ['app-shell', /^widget-/];
```

Tag names that don't pass the allowlist are silently skipped (or logged in `debug` mode). Tags that pass are fetched once, concurrent occurrences of the same tag share the in-flight request.

This protects against attacker-controlled markup (e.g. via `b-html`) introducing a tag whose loader fetch then runs through your auth.

## Putting it together

A typical production config:

```js
import { Lego } from 'lego-dom';
import DOMPurify from 'dompurify';
import * as Sentry from '@sentry/browser';

Lego.config.sanitize = DOMPurify.sanitize;
Lego.config.strict = true;
Lego.config.loaderAllowlist = /^app-/;
Lego.config.onError = (err, type, el) => {
  Sentry.captureException(err, { tags: { lego_type: type, tag: el?.tagName } });
};

await Lego.init(document.body, {
  styles: { base: ['/styles/theme.css'] },
  loader: (tag) => `/blocks/${tag}.lego`
});
```
