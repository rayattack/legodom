# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LegoDOM (npm: `lego-dom`) is a zero-dependency web components framework (~10kb gzipped) that turns standard HTML `<template>` tags into reactive, encapsulated custom elements. It uses direct DOM updates (no virtual DOM), ES6 Proxy-based reactivity, and Shadow DOM for encapsulation.

## Commands

- **Build**: `node build.js` (outputs `dist/lego.min.js` IIFE + `dist/lego.mjs` ESM + `dist/lego.d.ts`). Use `node build.js --dev` for sourcemaps.
- **Test**: `npx vitest run` (all tests) or `npx vitest run tests/<name>.test.js` (single test)
- **Docs dev**: `npx vitepress dev docs`

## Architecture

### Core Pipeline

Entry point is `src/index.js` which wires up dependency injection between modules and exports the `Lego` global/module.

**Initialization flow**: `Lego.init(root)` → register batcher with renderer → create reactive global state → auto-discover inline `<template b-id="...">` tags → setup routing (popstate/click handlers) → setup MutationObserver for auto-mounting components.

**Render cycle**: State mutation (via Proxy) → batcher queues element → `requestAnimationFrame` deduplicates and calls `render()` → TreeWalker scans bindings → directives execute → `updated()` lifecycle hook fires (debounced 50ms).

### Module Map

- **`src/core/reactive.js`** — Deep proxy wrapper. Recursively wraps state objects, notifies batcher on set. Detects `$db` descriptors for persistence integration.
- **`src/core/renderer.js`** — `render()`, `bind()`, `scanForBindings()`, `updateNodeBindings()`. Handles text/attribute interpolation (`[[expr]]` or `{{expr}}`), event listeners (`@click`, `@keydown.enter.prevent`), and directive execution.
- **`src/core/lifecycle.js`** — `snap()` (mount: clone template, attach shadow DOM, merge logic tiers, call `mounted()`) and `unsnap()` (unmount: call `unmounted()`, cleanup).
- **`src/core/batcher.js`** — RAF-based update queue with deduplication. Handles pending updates added during batch processing.
- **`src/core/registry.js`** — Global stores: `registry` (template defs), `proxyCache`/`privateData`/`forPools` (WeakMaps), `activeBlocks`, `legoFileLogic`, `globalSubscribers`.
- **`src/core/globals.js`** — Shared reactive global state (`Lego.globals`). Elements using globals are tracked in `globalSubscribers`.
- **`src/core/stylesheets.js`** — Constructable stylesheets and cascade mode handling.

### Directives (`src/directives/`)

Each directive exports an object with `name`, `scan()`, `execute()`, and `destroy()` methods:

| Directive | Purpose |
|-----------|---------|
| `b-if` | Conditional rendering (swaps with comment anchor) |
| `b-show` | Visibility toggle via `display: none` |
| `b-for` | List rendering with element pool and key tracking |
| `b-text` | Safe text content binding |
| `b-html` | Raw HTML insertion |
| `b-sync` | Two-way binding for form inputs |
| `b-init` | Run expression once on mount |
| `b-enter`/`b-leave` | CSS transition hooks |

### Features (`src/features/`)

- **`persistence.js`** — `$db('key')` API for IndexedDB/localStorage with cross-tab sync, debounce, and quota management (FIFO eviction).
- **`router.js`** — Regex path matching with params, middleware, `$go()` navigation.
- **`error.js`** — Hierarchical error boundaries with fallback UI rendering.

### Utilities (`src/utils/`)

- **`safe-eval.js`** — Sandboxed expression evaluation via `Function` constructor with `with()` scope. LRU cache (1000 entries). Blocks dangerous patterns (`eval`, `import`, `Function`, etc.).
- **`parser-utils.js`** — Parses `.lego` SFC format (`<template>`, `<script>`, `<style>` sections) into `Lego.block()` calls.
- **`dom.js`** — `escapeHTML()`, `findAncestor()` (traverses shadow DOM boundaries), `resolveTargets()`, `syncModelValue()`.
- **`helpers.js`** — Config, `mergeDescriptors()` (preserves getters/setters), delimiter handling (`[[]]` or `{{}}`).

### Vite Plugin (`vite-plugin.js`)

Transforms `.lego` SFC files. Auto-discovers blocks via glob, generates virtual module for pre-registration, supports HMR. Configured as `import legoPlugin from 'lego-dom/vite-plugin'`.

### Logic Merging Tiers

Components resolve logic in priority order:
1. **Tier 1**: Script logic from `.lego` file (`legoFileLogic`)
2. **Tier 2**: Template-level `b-logic` attribute
3. **Tier 3**: Instance-level `b-logic` attribute (supports scoped props via `Object.create`)

## Testing

Tests use Vitest + JSDOM. Each test file sets up its own DOM environment, mocks `CSSStyleSheet`, `requestAnimationFrame`, and loads the built library via `fs.readFileSync` of `dist/main.js`. Tests require a build first (`node build.js`). There is no separate vitest config file; configuration is inlined in `package.json` or defaults are used.

The user has nvm installed so always use - nvm use 22 to get node and tools required for building and testing

## Key Patterns

- **Anchor pattern**: `b-if` and `b-for` use comment nodes as DOM anchors to track insertion points without breaking TreeWalker traversal.
- **WeakMap cleanup**: `privateData`, `proxyCache`, and `forPools` use WeakMaps so component metadata is garbage-collected with the element.
- **Dependency injection**: Batcher receives the render function, error module receives snap/render, router receives snap — all wired in `index.js` to avoid circular imports.
- **Scope isolation in loops**: `b-for` creates child scopes via `Object.create(state)` so loop items inherit parent state without mutation.
