# Changelog

All notable changes to this project will be documented in this file.

## [1.3.2] - 2026-01-16

### Fixes

- **Inline Arrays in `b-for`:** Fixed a bug where inline arrays like `b-for="item in [{ name: 'A' }, { name: 'B' }]"` would fail to render. The fix changes `b-for` to clone the entire node as a template instead of storing innerHTML.

### Documentation

- **Large Apps Guide:** Added "Scaling to Multi-Domain Apps" section for enterprise projects with multiple business domains (HRIS, Finance, Planning, etc.).

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
