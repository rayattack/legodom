# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-01-10

**The Launch Release!** 🚀
LegoDOM moves out of beta with a finalized API, robust routing, and a hybrid rendering engine.

### 🌟 Major features

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

### ⚡ Improvements

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

### 🐛 Bug Fixes

- Fixed "Literal Mustaches" appearing in `href` and text content on initial load.
- Fixed Deep Linking where hitting Refresh on a sub-route would render an empty shell (addressed via Self-Healing pattern).
- Fixed an issue where `Lego.globals` changes triggered a full re-render of unrelated components.
