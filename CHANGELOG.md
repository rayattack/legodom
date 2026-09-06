# Changelog

## [Unreleased]

**Component contract**
- Reactive props: `b-props="name, count: Number = 0, tags: Array = []"` declares props with optional types and defaults. Parents bind them with `:prop="expr"` (kebab-case maps to camelCase) and the child re-renders when the expression changes. Plain attributes on declared props are coerced by type. Declared props always exist on state; a Boolean with no attribute is `false`.
- `Lego.block(tag, { template, logic, styles, cascade, error, props, shadow, form })` options form. The positional form still works.
- Shadow DOM opt-out: `shadow: false` (or `<template b-shadow="false">`) renders into the element itself, emulates default and named slots by moving the original children once at mount, and scopes the block's `<style>` by prefixing selectors with the tag name.
- Form participation: `form: true` (or `<template b-form>`) makes the element form-associated and exposes `$form` with `setValue`, `setValidity`, `reportValidity`, `checkValidity`. A `value` state key is kept in sync with the form value.
- Lifecycle: `updated()` now runs synchronously after each flush, once per block per flush; the 50ms debounce is gone. New `beforeUpdate()`, `errorCaptured(err, info)` (return `false` to stop the error before any boundary), and `$loading` while an async `mounted()` is pending. A flush drains work scheduled during the flush, so a parent writing a child's prop reaches the DOM in the same frame.

**Application instances**
- `Lego.createApp({ config, globals })` returns an app with its own `block`, `route`, `init`, `globals`, `config`, `use`, `nextTick`, `effect`, `watch`, `defineLegoFile`, `mount` and `db`. The default `Lego` export is itself an app built on the module-level config, so existing code is unchanged.
- Two apps on one page can use different delimiter syntaxes, independent globals, independent routes with `init(root, { routerTarget })`, and per-app `strict`, `onError`, `sanitize` and `loader` settings.
- `app.use(plugin, options)` installs a plugin once per app; the existing Monitoring plugin works through it.
- Custom element names are document-global, so a second app defining an already defined tag warns and keeps the first.

**Server rendering**
- New entry `lego-dom/server`: `createRenderer()` with `define`, `defineLegoFile`, and `renderToString(tag, { props, globals, route, slots, attrs })`. Pure Node, no DOM, zero dependencies, hand-written HTML parser for the template subset. Lifecycle hooks are not run on the server.
- Output carries the hydration contract: `b-hydrate` on block hosts, `<template shadowrootmode="open">` for shadow blocks, `<!--b-if: expr-->` for false branches, `<!--b-for: item in list-->` plus `data-b-key` on rows, and all `b-*`, `@*` and `:*` attributes preserved as authored.

**Reactivity core rewritten around effects**
- Dependencies now belong to the effect that read them (a binding, a computed, a watcher), not to the host element. An object shared by two blocks updates both. `Lego.globals` is an ordinary reactive object; the source-text scan for `global.x` is gone.
- Dependency sets are cleared on every run, so a binding stops re-running on keys it no longer reads.
- Rows inside `b-for` react individually: changing one item's field re-runs only that row's bindings.
- Author getters are cached computeds: they recompute only when something they read changes. A getter that reads nothing reactive is constant after its first evaluation.
- New: `this.$watch(source, cb)`, `Lego.watch(source, cb)`, `Lego.effect(fn)`, `Lego.nextTick()`.
- Writes to keys no binding has read no longer force a whole-block render.

**Template expressions are compiled, not evaluated**
- `[[ ]]`, directive expressions, `@event` handlers and `b-logic` object literals go through a tokenizer, parser and closure compiler. No `new Function`, no `with()`. Templates run under a CSP without `unsafe-eval`.
- Expressions cannot reach `window`, `document`, `fetch` or any host global. A fixed allowlist (`Math`, `JSON`, `Date`, `Array`, `Object`, `Promise`, `Set`, `Map`, `Intl`, and a few more) is available. `new` works on those constructors.
- `__proto__` is denied everywhere. `constructor` and `prototype` are denied only when the read would yield a function, so data fields with those names render.
- `$event` now resolves in handlers. Unsupported: statements, block bodies, regex literals, spread, destructuring. `b-logic` method shorthand with a statement body falls back to `Function()` with a one-time warning.
- The sandbox is CSP and prototype-pollution protection, not a trust boundary for untrusted templates: `self` and `$element` are DOM nodes.

**Correctness fixes**
- Built-ins with internal slots (`Set`, `Map`, `Date`, `Promise`, typed arrays, and others) are no longer proxied, so their methods work in state. Plain objects, arrays and class instances stay reactive.
- Async `mounted()`, `unmounted()`, `updated()`, event handlers and directive expressions route rejections into error boundaries and `config.onError`.
- Moving a block in the DOM (a `b-for` reorder, an `appendChild`) no longer destroys its state; teardown is deferred by a microtask. `$mount` and the router still run the outgoing block's `unmounted()` before the incoming block's `mounted()`.
- `b-sync` runs after the bindings that populate its element, so a `<select>` whose options come from `b-for` keeps its value.
- Routes registered after `Lego.init()` now work.
- `$db` never evicts other keys on a storage quota error; it reports through `config.onError(err, 'quota', key)` and abandons the write.
- `fast-glob` is no longer a runtime dependency.

**Bundle**: about 18 KB gzipped, up from 14 KB. The expression compiler accounts for nearly all of the increase.

## [2.1.4] - 2026-01-26

**Major Architecture Upgrade: Native Web Components**

This release marks a significant shift in how LegoDOM detects and upgrades blocks, moving from a global `MutationObserver` to standard `customElements` definitions.

**Core Changes:**
- **Dropped**: The Global `MutationObserver` has been removed.
- **Added**: `Lego.block` now registers blocks using `customElements.define`.
- **Impact**: 
    - Blocks are now detected instantly by the browser.
    - **Fixes**: "Blank Page" issues when `b-if` re-inserts blocks inside Shadow DOMs.
    - **Fixes**: Blocks inside `innerHTML` or `ShadowRoot` work automatically without manual scanning.

**New Feature: Manifest API (for Server Blocks in Shadow DOM)**
Because standard browser APIs cannot auto-detect *unknown* tags inside Shadow DOMs, we introduced a Manifest API to pre-register them.

```js
Lego.init({
  manifest: [
    { base: '/api/', legos: ['user-widget'] }
  ]
});
```
- **Pre-Registration**: Maps unknown tags to URLs so `customElements` works everywhere.
- **Lazy Loading**: Code is only fetched when the tag appears in the DOM.
- **Shadow Support**: Works perfectly inside nested Shadow Roots.

**Security Improvements:**
- **Secure Fetching**: Added support for `credentials: 'include'` to manifest groups.
- **Dynamic Headers**: Added support for runtime header resolution (e.g. `'Authorization': () => token`).
- **Safety**: Explicitly discouraged storing secrets in `localStorage` (`$db`).

**Legacy Support:**
- **Auto-Discovery**: The old "scan for unknown tags" behavior is preserved as an optional fallback (via a lightweight Observer) strictly for users providing a `loader` without a manifest.


## [2.1.3] - 2026-01-26
## [2.1.2] - unbuilt [bumped to 2.1.3]
## [2.1.1] - unbuilt [bumped to 2.1.2]
Welcome to **LegoDOM v2**! This release represents a massive architectural shift to modular files from large sinfle iife

### Features
- Added runtime methods to `$db` for one-off persistence operations:
  - `$db(key).set(value, debounce?)` - Write to localStorage and trigger reactivity
  - `$db(key).get()` - Read current value from localStorage
  - `$db(key).delete()` - Remove key and notify all bindings
- Made `$db` available in template expressions (event handlers, bindings, etc.)
- Updated FOUC prevention documentation to exclude `lego-router` from hiding rules

### Fixes
- **BREAKING**: Renamed `$db.save()` to `$db.set()` for better API consistency with JavaScript `Map`
- Fixed `$db` not triggering reactivity for local bindings in the same tab when values changed
- Fixed FOUC CSS accidentally hiding `lego-router` container elements
- Updated `create-legodom` template to use `lego-dom@^2.1.0`

### Documentation
- Added comprehensive runtime API documentation to `docs/guide/persistence.md`
- Updated FAQ with corrected FOUC prevention CSS pattern


### Features

- **Reactive Persistence (`$db`):** New helper for persisting state to `localStorage` with automatic hydration, debouncing, and cross-tab synchronization.
  ```html
  <user-prefs b-logic="{
    theme: $db('app.theme').default('light'),
    volume: $db('app.vol').default(50).debounce(300)
  }"></user-prefs>
  ```
  - **Auto-Load:** Values are automatically hydrated from `localStorage` on block creation.
  - **Auto-Save:** Changes are automatically persisted (with optional debounce).
  - **Cross-Tab Sync:** Updates in one tab automatically reflect in other tabs.

- **Vite Plugin DX:** Default `blocksDir` is now `./src` (was `./src/blocks`), allowing auto-discovery of `.lego` files anywhere in the source tree (as long as they follow the kebab-case hyphenation rule).

- **`$index` in `b-for`:** Access the current item's 0-based index in loops.
  ```html
  <li b-for="item in items">
    #[[ $index + 1 ]]: [[ item.name ]]
  </li>
  ```

- **`b-key` Directive:** Optimized rendering for lists by providing stable identities for elements.

- **Error Boundaries (`b-error`):** Gracefully handle block crashes with cascading error boundaries!
  ```html
  <template b-error="error-card">
    <user-profile></user-profile>
    <activity-feed></activity-feed>
  </template>
  ```
  - **Cascading:** Errors bubble up to the nearest parent boundary (template or instance level).
  - **Error Context:** Error blocks receive `$error` object with `message`, `stack`, and `component` properties.
  - **Automatic Recovery:** Replace crashed blocks with custom fallback UI instead of blank screens.
  - **Global Fallback:** Falls back to `config.onError` if no boundary is found.

- **Cascading Stylesheets (`b-cascade`):** New attribute for selective stylesheet inheritance!
  ```html
  <body b-stylesheets="theme" b-cascade="theme">
    <!-- All children inherit 'theme' automatically -->
    <app-root></app-root>
  </body>
  ```
  - **Inheritance:** Child blocks inherit stylesheets listed in `b-cascade` from their ancestors.
  - **Explicit Override:** Adding `b-stylesheets` to a child merges with inherited styles (child-specific styles take precedence).
  - **Debug API:** inspect inheritance with `Lego.debug.stylesheets($0)`.

- **New CLI Tooling:** Released `create-legodom` for instant project scaffolding.
  ```bash
  npm create legodom@latest
  ```

- **Scoped Props (`b-logic`):** `b-logic` attributes now inherit the parent block's scope! You can pass state naturally to children without global variables.
  ```html
  <!-- 'user' is resolved from the parent block's state -->
  <user-avatar b-logic="{ user: user }"></user-avatar>
  ```

- **`$parent` Helper:** Added `this.$parent` (and template access) to easily find the nearest ancestor Block. It intelligently skips non-block elements (divs, spans) and handles Shadow DOM boundaries.
  ```javascript
  const parentBlock = this.$parent;

- **Public State API:**
  - `element.state` is now the official public API for accessing the reactive proxy.
  - `element._studs` is considered internal/private.

- **Lego Studio Audit:**
  - `lego-studio` has been refactored to use "Block" terminology throughout the UI and codebase.


### Fixes

- **Init Optimization:** Fixed double render on initialization. Route is now initialized before DOM scan, preventing reactive updates from triggering a second render pass.
  - **Before:** Elements rendered twice (once during `snap()`, once when `_matchRoute()` updated `Lego.globals.$route`).
  - **After:** Elements render once with correct route data already available.
  - **Impact:** Faster initial load, cleaner error logs (no duplicate errors).

- **Vite Plugin `b-cascade`/`b-error`:** Fixed a bug where `b-cascade` and `b-error` attributes defined in `.lego` files were not passed to `Lego.block()`, causing stylesheet inheritance and error boundaries to fail.

- **Lego Studio Scaffolding:** Fixed an issue where `.lego` files were expected to be in `src/block`, causing a blank screen upon scaffolding.

- **Global State Subscription Tracking:** Optimized global state updates from O(N) to O(K) complexity.
  - Previously scanned all active blocks to check for global dependencies.
  - Now maintains a dedicated `globalSubscribers` Set for instant lookups.
  - Significantly faster for apps with thousands of blocks.

- **Fixed Circular Reference Leaks:** Enhanced `unsnap()` to clear all closure-captured references.
  - Explicitly nulls `$emit`, and deletes `$parent`, `$route`, `$go` getters.
  - Prevents memory leaks from closures capturing element references.
  - Ensures complete garbage collection of removed blocks.

- **Auto-Discovery Logic:** Fixed a bug where elements present in the initial HTML were not detected by the `config.loader`. The discovery logic now scans the DOM during `Lego.init()` as well as on subsequent mutations.
- **b-stylesheets Support:** Fully implemented `b-stylesheets` to allow blocks to adopt constructable stylesheets.
- **SSR/Node Compatibility:** Added checks for `window`, `document`, and `Node` throughout the core to ensure LegoDOM can be imported and executed in Node.js/SSR environments without crashing.
- **Global Export:** `Lego` is now correctly exported to `global` in Node.js environments.

- **SSR/Node Compatibility:** Added checks for `window`, `document`, and `Node` throughout the core to ensure LegoDOM can be imported and executed in Node.js/SSR environments without crashing.
- **Global Export:** `Lego` is now correctly exported to `global` in Node.js environments.

### Breaking Changes 

- **`b-for` Sibling Rendering:** The element with `b-for` is now **replaced** by its clones as siblings, instead of nesting clones inside itself. This fixes invalid HTML like `<p><p>...</p></p>` and ensures correct CSS behavior (hover, focus, etc.).
  ```html
  <!-- Template -->
  <ul>
    <li b-for="item in items">[[ item ]]</li>
  </ul>
  
  <!-- Now renders as: -->
  <ul>
    <!--b-for: item in items-->
    <li>Apple</li>
    <li>Banana</li>
  </ul>
  ```

- **Terminological Refactor (Runtime & Docs):**
  - **Components → Blocks:** The fundamental unit of UI is now a "Block".
  - **SFC → Lego File:** Protocol-agnostic Single File Blocks.

- **API Renames:**
  - `Lego.define()` is now **`Lego.block()`**. (Legacy alias maintained)
  - `Lego.defineSFC()` is now **`Lego.defineLegoFile()`**.
  - Internal: `deriveComponentName` is now `deriveBlockName`.

- **Attribute Renames:**
  - `b-data` is now **`b-logic`**. (Legacy alias maintained)
  - `b-styles` is now **`b-stylesheets`**.


### Developer Experience

- **Error Logging:** Fixed 4 silent catch blocks that swallowed errors without any console output:
  - `parseJSObject` now logs `b-data`/`b-logic` syntax errors.
  - `b-key` warns when it resolves to `undefined`.
  - localStorage hydration errors are now logged.
  - Cross-tab sync errors are now logged.

- **b-cascade Guide:** Added documentation for cascading stylesheets, best practices for global themes vs block styles.
- **Directives:** Merged cascade docs into the main Directives guide.

- Added `docs/guide/persistence.md` covering the `$db` API, namespacing best practices, and performance warnings.


## [1.5.1] - 2026-01-19

### Breaking Changes

- **Renamed `b-styles` to `b-stylesheets`:** The directive for injecting shared stylesheets into shadow roots has been renamed from `b-styles` to `b-stylesheets` to avoid confusion with the `style` attribute and better reflect its purpose (injecting Constructable Stylesheets).
  ```html
  <!-- Before -->
  <template b-styles="base theme">
  
  <!-- After -->
  <template b-stylesheets="base theme">
  ```

### Documentation

- **New "Helper Utilities" Guide:** Added a dedicated page at `/docs/guide/helpers.md` documenting core instance methods like `$ancestors`, `$emit`, `$route`, `$go`, `$vars`, `$element`, and `$registry`.
- **Performance Tips Updated:** Revised the "Performance Tips" section in the Directives guide to correctly compare `b-show` (toggle visibility) vs `b-if` (DOM insertion/removal) instead of the outdated `b-show` vs CSS comparison.

## [1.5.0] - 2026-01-19

> [!WARNING] DEPRECATED
> This version has been deprecated due to an incomplete rename of `b-styles`. Please use `1.5.1`.

## [1.4.0] - 2026-01-16

### Breaking Changes

- **`$ancestors()` now returns element instead of state:** For consistency with `$element`, `$ancestors()` now returns the ancestor element. Access state via `.state` property.
  ```javascript
  // Before (v1.3.x)
  const userId = this.$ancestors('user-profile').userId;
  
  // After (v1.4.0)
  const userId = this.$ancestors('user-profile').state.userId;
  ```
  **Migration:** Add `.state` after all `$ancestors()` calls that access component state.

## [1.3.5] - 2026-01-16

### Features

- **Lego Studio:** Added zero-config component development environment. Enable with `Lego.init(document.body, { studio: true })` and navigate to `/_/studio` to browse, preview, and inspect components in real-time.
  - Component browser with search/filter
  - Live component preview in isolation
  - Real-time state inspector with JSON editor
  - URL deep linking for sharing components
  - Published as separate package: `@legodom/studio@0.0.2`

- **Advanced API:** Exposed `Lego.snap()` and `Lego.unsnap()` for manual component initialization and cleanup. Useful for building dev tools, testing, and dynamic component creation in Shadow DOMs.
  ```javascript
  const el = document.createElement('my-component');
  mount.appendChild(el);
  Lego.snap(el);  // Manually initialize
  
  // Later...
  Lego.unsnap(el);  // Clean up
  ```

- **Component State Property:** Added `element.state` getter/setter to all component instances for cleaner state access.
  ```javascript
  // Before (internal API)
  const state = element._studs;
  
  // After (public API)
  const state = element.state;
  element.state = { count: 5 };  // Merges into existing state
  ```

### Documentation

- **Advanced API Guide:** Added comprehensive documentation for `Lego.snap()` and `Lego.unsnap()` at `/docs/api/advanced.md`
- **Lego Studio Guide:** Added full Studio documentation at `/docs/guide/studio.md` with quick start, examples, and troubleshooting

### Improvements

- **Studio CDN Loading:** Studio is loaded on-demand from unpkg CDN when `studio: true` is set, keeping core LegoDOM lightweight
- **State Reactivity:** The `element.state` setter uses `Object.assign()` to merge new values while preserving the reactive Proxy

## [1.3.4] - 2026-01-16

### Improvements

- **Minified Build:** Added a build script (`npm run build`) that uses `esbuild` to generate a `main.min.js` file, reducing file size by ~55% for optimal CDN performance.

## [1.3.3] - 2026-01-16

### Fixes

- **Inline Arrays in `b-for`:** Fixed a bug where inline arrays like `b-for="item in [{ name: 'A' }, { name: 'B' }]"` would fail to render. The fix changes `b-for` to clone the entire node as a template instead of storing innerHTML.

### Documentation

- **Large Apps Guide:** Added "Scaling to Multi-Domain Apps" section for enterprise projects with multiple business domains (HRIS, Finance, Planning, etc.).

### Improvements

- **Vite Plugin:** Added `importPath` option to `legoPlugin()`, allowing developers to override where the `Lego` core is imported from (e.g., for local testing or custom builds).

## [1.3.1] - 2026-01-16

### Fixes

- **`this.$emit()` in Script Methods:** `$emit` is now available on the component state, allowing event dispatching from script logic.
  ```javascript
  handleSave() {
    this.$emit('save', { id: this.itemId });
  }
  ```

## [1.3.0] - 2026-01-16

### New Features

- **`b-var` Directive:** Access DOM elements directly via `this.$vars.name`. Useful for triggering `.click()`, `.focus()`, or `.play()` on hidden inputs, video elements, etc.
  ```html
  <input type="file" b-var="fileInput" style="display:none">
  <button @click="$vars.fileInput.click()">Upload</button>
  ```

### Documentation

- **New Guide: Large Apps ("Chaos Tends To A Minimum"):** Added a comprehensive architectural guide for structuring enterprise-scale projects with 200+ components. Introduces the Blocks, Widgets, Components, Pages hierarchy to cleanly separate Identity, Intent, Computation, and Coordination.
- **`b-if` Directive:** Documented the `b-if` directive for conditional rendering (DOM insertion/removal).
- **`b-text` Directive:** Documented the limited `b-text` directive (property paths only, no expressions).
- **Directives "See Also":** Added cross-references to `b-target`, `b-id`, `b-styles` in the Directives guide.

## [1.2.0] - 2026-01-15

**Breaking Change: New Template Syntax** 🚨
To ensure compatibility with server-side frameworks (Jinja, Django, Flask) and JavaScript template literals, **LegoDOM now uses `[[ ]]` by default** instead of `{{ }}`.

- **Breaking:** Default interpolation syntax changed from `{{ variable }}` to `[[ variable ]]`.
- **Feature:** Added `Lego.config.syntax` to configure delimiters.
    - Set to `'mustache'` to revert to `{{ }}`.
    - Set to `'brackets'` (default) for `[[ ]]`.
- **Feature:** Added support for snake_case, PascalCase, camelCase, and kebab-case component names for `.lego` files.
- **Feature:** Added `Lego.config.loader` to fetch SFCs from a server endpoint.
- **Fix:** Fixed a critical bug where `snap()` triggered double renders and mounted hooks.

## [1.1.0] - 2026-01-12

**The Enterprise Readiness Update** 
This release focuses on Security, Performance, and Resilience, making LegoDOM suitable for high-traffic production environments.

### Security Hardening

- **Secure Expression Evaluation:** Implemented a new `safeEval` validator that blocks dangerous keywords (e.g., `function`, `eval`, `constructor`) to prevent arbitrary code execution.
- **XSS Protection:** `safeEval` now automatically escapes output by default.
- **New `b-html` Directive:** Added `b-html` for safely rendering raw HTML content (replacing `innerHTML`), requiring explicit opt-in for potential XSS risks.

### Performance

- **Expression Caching:** Compiled expressions are now cached in a `WeakMap`, transforming `O(n)` compilation costs into `O(1)` for repeated renders. This yields a massive performance boost for large lists (`b-for`).
- **Optimized Binding:** Replaced `querySelectorAll('*')` with `TreeWalker`, significantly reducing memory allocation and DOM traversal time during component initialization.

### Resilience & Scalability

- **Global Error Handling:** Introduced `Lego.config.onError` hook for centralized error reporting (compatible with Sentry/Datadog).
- **Graceful Rendering:** Rendering errors (e.g., accessing undefined properties in `{{ }}`) are now caught and reported, but do not crash the component or application.
- **Memory Management:** Fixed nested component lifecycle issues where Shadow DOM children were not correctly tracked, preventing memory leaks in complex trees.
- **Monitoring Plugin:** Added performance monitoring hooks (`onRenderStart`, `onRenderEnd`) and a new `monitoring-plugin.js` for realtime metrics.

## [1.0.0] - 2026-01-10

**The Launch Release!** 🚀
LegoDOM moves out of beta with a finalized API, robust routing, and a hybrid rendering engine.

### Major features

- **Surgical Routing:** Introduced a groundbreaking `b-target` attribute that allows any link to update any part of the page without a full reload.
    - **Smart History:** The router now tracks surgical updates in `history.state`, correctly restoring "fragment" states when using the Back/Forward buttons.
    - **Persistent Layouts:** Support for "Holy Grail" layouts where sidebars never reload or lose state (scroll position, inputs) while main content changes.
- **Hybrid Rendering Engine:**
    - **Light DOM Support:** The engine now hydrates `{{mustaches}}` in `index.html` and Light DOM slots, not just inside Shadow Roots.
    - **Global Reactivity:** Components now automatically broadcast global state changes (like URL params) to all active subscribers.
    - **Optimized Updates:** A dependency tracking system ensures only components that *use* global state are re-rendered.
- **Developer Experience (DX):**
    - **Automatic Injection:** `$route` and `$go` are now injected into every component's script scope (`this.$route`, `this.$go`), removing the need for `Lego.globals.xxx`.
    - **Cleaner Templates:** Template expressions now support `$route` directly (`{{ $route.params.id }}`) without `global.` prefix.
    - **HMR 2.0:** The Vite plugin now correctly handles adding/deleting `.lego` files and performs smarter hot updates.

### Improvements

- **Router:**
    - Exposed `$go(path, ...targets).get()` for programmatic surgical navigation.
    - Fixed `TypeError` where `$go` was not found in component scopes.
    - Support for multiple URL parameters (e.g., `/customers/:id/orders/:orderId`).
    - Defaults `b-link` to `true` (always push history) unless explicitly set to `false`.
- **Core:**
    - `Lego.init()` is now required to start the engine, allowing for explicit control over startup timing.
    - `e.composedPath()` is used for event delegation, allowing links inside Shadow DOM to trigger the global router.
    - Fixed `b-sync` losing reactivity inside `b-for` loops.
    - Fixed hydration of attributes like `href="/user/{{id}}"`.
- **Docs:**
    - Complete overhaul of Routing guide with "Surgical Swaps", "Deep Linking", and "Self-Healing" patterns.
    - Clarified component naming conventions (Filename for Vite vs. `b-id` for CDN).

### Bug Fixes

- Fixed "Literal Mustaches" appearing in `href` and text content on initial load.
- Fixed Deep Linking where hitting Refresh on a sub-route would render an empty shell (addressed via Self-Healing pattern).
- Fixed an issue where `Lego.globals` changes triggered a full re-render of unrelated components.
