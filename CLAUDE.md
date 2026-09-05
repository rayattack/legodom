# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LegoDOM (npm: `lego-dom`) is a zero-dependency web components framework (~18 KB gzipped) that turns standard HTML `<template>` tags into reactive, encapsulated custom elements. It uses direct DOM updates (no virtual DOM), ES6 Proxy-based reactivity, and Shadow DOM for encapsulation.

## Commands

- **Build**: `node build.js` (outputs `dist/lego.min.js` IIFE + `dist/lego.mjs` ESM + `dist/lego.server.mjs` Node ESM + `dist/lego.d.ts` + `dist/lego.server.d.ts`). Use `node build.js --dev` for sourcemaps.
- **Test**: `npx vitest run` (all tests) or `npx vitest run tests/<name>.test.js` (single test)
- **Docs dev**: `npx vitepress dev docs`

## Architecture

### Core Pipeline

Entry point is `src/index.js` which wires up dependency injection between modules and exports the `Lego` global/module.

**Initialization flow**: `Lego.init(root)` → register batcher with renderer → create reactive global state → auto-discover inline `<template b-id="...">` tags → setup routing (popstate/click handlers) → setup MutationObserver for auto-mounting components.

**Render cycle**: State mutation (via Proxy) → `trigger()` wakes the effects that read the key → each effect's scheduler marks its binding dirty on the host block and queues the element → `requestAnimationFrame` deduplicates and calls `render()` → `beforeUpdate()` fires, only the dirty bindings re-run (each re-collecting its deps), and the flush keeps draining until nothing new is queued (so a parent writing a child's prop settles in the same frame) → `updated()` fires synchronously, once per element per flush.

### Module Map

- **`src/core/effect.js`** — The dependency graph. `createEffect`/`track`/`trigger`, plus `computed` and `watch`. Pure: no DOM, no framework imports. Deps belong to the effect that read them and are re-collected on every run.
- **`src/core/reactive.js`** — Deep proxy wrapper. `get`/`has`/`ownKeys` track, `set`/`deleteProperty` trigger. Knows nothing about elements or the batcher. Detects `$db` descriptors for persistence integration.
- **`src/core/renderer.js`** — `render()`, `bind()`, `scanForBindings()`, `runBindings()`. Handles text/attribute interpolation (`[[expr]]` or `{{expr}}`), event listeners (`@click`, `@keydown.enter.prevent`), and directive execution.
- **`src/core/lifecycle.js`** — `snap()` (mount: clone template, attach shadow DOM *or* render into the light DOM and emulate slots when the block declares `b-shadow="false"`, merge logic tiers, apply props, call `mounted()`) and `unsnap()` (unmount: call `unmounted()`, cleanup).
- **`src/core/batcher.js`** — RAF-based update queue with deduplication. Handles pending updates added during batch processing. Exposes `nextTick()`.
- **`src/core/element.js`** — `createBlockElementClass()`, the single custom element class behind every block. Teardown on disconnect is deferred by a microtask so DOM moves do not destroy block state. Also carries `static formAssociated` / `observedAttributes`, which the platform reads once at define time, so both describe what the registry knew then.
- **`src/core/registry.js`** — Global stores: `registry` (template defs), `proxyCache`/`privateData`/`forPools` (WeakMaps), `activeBlocks`, `legoFileLogic`.
- **`src/core/globals.js`** — Shared reactive global state (`Lego.globals`). An ordinary `reactive()` object: bindings that read `global.x` subscribe by reading it.
- **`src/core/stylesheets.js`** — Constructable stylesheets and cascade mode handling. Also `adoptLightStyle()`, which scopes a light-DOM block's `<style>` by rewriting every selector through the CSSOM (`self` becomes the tag name) and injects it into `<head>` once per tag.

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
| `b-enter`/`b-leave` | Viewport enter/exit hooks via IntersectionObserver |

`b-props` (`src/directives/b-props.js`) is not a directive in that sense: it owns the per-tag prop contract. It parses `name`, `name: Type`, `name = default` and `name: Type = default`, compiles defaults through `expression.js` (evaluated per instance), coerces plain attributes through the declared type, and still warns about undeclared `b-logic` keys and missing props. A parent writes a declared prop with `:prop-name="expr"`, which the renderer scans into a `prop` binding owned by the parent's effect.

### Features (`src/features/`)

- **`persistence.js`** — `$db('key')` API backed by **localStorage only** (no IndexedDB), with cross-tab sync via the `storage` event, per-key debounce, and quota reporting: a `QuotaExceededError` is surfaced through `config.onError(err, 'quota', key)` and the write is abandoned. Lego never evicts keys.
- **`router.js`** — Regex path matching with params, middleware, `$go()` navigation.
- **`error.js`** — Hierarchical error boundaries with fallback UI rendering, plus the `errorCaptured` walk that runs first: every block from the erroring element outwards gets a look, and returning `false` claims the error (no boundary, no `config.onError`).
- **`form.js`** — Form-associated blocks (`b-form`). `attachFormInternals()` returns real `ElementInternals` where the platform has it and a shim otherwise (JSDOM); `createFormApi()` is the `$form` object on state.

### Utilities (`src/utils/`)

- **`expression.js`** — Tokenizer, precedence-climbing parser and AST-to-closure compiler for template expressions. Pure (no DOM/core imports). LRU cache (1000 entries) of compiled closures. Identifier lookup is helpers -> scope -> caller extras -> named context (`global`/`self`/`event`/`$event`/`helpers`) -> a fixed allowlist of safe globals -> ReferenceError. Denies `__proto__` and the `Object` reflection helpers by name; denies `constructor`/`prototype` by value (only when the read would yield a function, so data fields with those names still work). Writes to all three are always denied.
- **`safe-eval.js`** — Thin wrapper over `expression.js`: builds the `$`-helpers, applies auto-invoke and `throwError`/`config.strict` semantics, and parses `b-logic` (`parseJSObject`). Keeps one `new Function` fallback, used only for `b-logic` method shorthand with statement bodies.
- **`parser-utils.js`** — Parses `.lego` SFC format (`<template>`, `<script>`, `<style>` sections) into `Lego.block()` calls.
- **`dom.js`** — `escapeHTML()`, `findAncestor()` (traverses shadow DOM boundaries), `resolveTargets()`, `syncModelValue()`.
- **`helpers.js`** — Config, `mergeDescriptors()` (preserves getters/setters), delimiter handling (`[[]]` or `{{}}`), `camelCase`/`kebabCase` for prop-to-attribute naming.
- **`glob.js`** — Minimal glob-to-RegExp matcher used by the Vite plugin for `.lego` discovery, so the package has no runtime dependencies.

### Server Renderer (`src/server/`)

Shipped as a separate package entry, `lego-dom/server`, built to `dist/lego.server.mjs` (ESM, `platform: 'node'`, not minified). Renders blocks to HTML strings with no DOM. Imports only the pure utilities (`expression.js`, `parser-utils.js`, `helpers.js`, `lru-cache.js`); importing anything from `core/` or `features/` would drag in `document`.

- **`index.js`**: `createRenderer({ syntax, sanitize })` returning `define` / `defineLegoFile` / `renderToString` / `has` / `names`. Owns the definition registry, the per-renderer delimiters, the `self` to `:host` CSS rewrite, `b-props` parsing and the slot map. `defineLegoFile` is the only place the server compiles source text (`new Function` on the `.lego` script section's default export), matching `src/core/parser.js`.
- **`render.js`**: The render walk. Same directive semantics as `src/core/renderer.js` plus `src/directives/`, expressed as a pure string-producing recursion. Expressions go through the same `compile()` the client uses, so identifier resolution order is identical. `MAX_BLOCK_DEPTH` (32) caps block composition.
- **`html.js`**: Hand-written HTML parser and serializer for the template subset: attributes (quoted, unquoted, valueless), void elements, raw-text elements (`style`/`script`/`textarea`/`title`), comments, self-closing syntax. Entities are not decoded; authored source round-trips verbatim, and escaping (`escapeText` / `escapeAttr`) is applied only to values the renderer computes. Strict by default, `{ lenient: true }` for the sanitizer.
- **`css.js`**: Block style scoping. Shadow blocks get the `self` to `:host` rewrite `lifecycle.js` does at mount. Light DOM blocks get every top-level selector prefixed with the tag name (per entry in a selector list; a selector naming `self` becomes the bare tag name instead of doubling), recursing into `@media`/`@supports`/`@container`/`@layer` and leaving `@keyframes`/`@font-face` alone. A rule splitter, not a CSS parser: preludes are rewritten, declaration bodies are copied through.
- **`sanitize.js`**: Server twin of `defaultSanitize` in `src/utils/dom.js`, applied over the parse tree instead of a live DOM. Keep the two rule sets in step.

Output contract (consumed by the client hydration engine): hosts carry `b-hydrate` and `b-id`; shadow blocks emit `<template shadowrootmode="open">` with the `<style>` first; light DOM blocks emit `<style data-lego-style="tag-name">` for de-duplication; `b-if` false becomes `<!--b-if: EXPR-->`; `b-for` becomes `<!--b-for: item in list-->` plus clones carrying `data-b-key`. Nested block props layer as logic defaults, then `b-logic`, then declared plain attributes, then `:prop`. No `b-`, `@` or `:` attribute is ever stripped. Lifecycle hooks are never called. Documented in `docs/tutorial/ssr.md`.

### Vite Plugin (`vite-plugin.js`)

Transforms `.lego` SFC files. Auto-discovers blocks via glob, generates virtual module for pre-registration, supports HMR. Configured as `import legoPlugin from 'lego-dom/vite-plugin'`.

### Logic Merging Tiers

Components resolve logic in priority order:
1. **Tier 1**: Script logic from `.lego` file (`legoFileLogic`)
2. **Tier 2**: Template-level `b-logic` attribute
3. **Tier 3**: Instance-level `b-logic` attribute (supports scoped props via `Object.create`)

Props are applied on top of the merged tiers, in `applyProps()`: declared defaults fill only what is still `undefined`, then `el._pendingProps` (what a parent's `:prop` binding stashed while the child was unsnapped), then plain attributes coerced through the declared type.

## Testing

Tests use Vitest + JSDOM. Each test file sets up its own DOM environment, mocks `CSSStyleSheet`, `requestAnimationFrame`, and loads the built library via `fs.readFileSync` of `dist/main.js`. Tests require a build first (`node build.js`). There is no separate vitest config file; configuration is inlined in `package.json` or defaults are used.

The user has nvm installed so always use - nvm use 22 to get node and tools required for building and testing

## Key Patterns

- **Anchor pattern**: `b-if` and `b-for` use comment nodes as DOM anchors to track insertion points without breaking TreeWalker traversal.
- **WeakMap cleanup**: `privateData`, `proxyCache`, and `forPools` use WeakMaps so component metadata is garbage-collected with the element.
- **Dependency injection**: Batcher receives the render function, error module receives snap/render, router receives snap — all wired in `index.js` to avoid circular imports.
- **Scope isolation in loops**: `b-for` creates child scopes via `Object.create(state)` so loop items inherit parent state without mutation. Each pooled row keeps its scope and owns the effects for its own bindings, so mutating one item re-runs one row.
- **Effects own dependencies**: bindings, computeds and watchers are effects. Stop them (unsnap, b-for eviction, b-html wipe) or they keep receiving triggers.
