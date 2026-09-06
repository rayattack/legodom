# Architectural Deep Dive

Welcome to the internal documentation of LegoDOM.

::: warning Code excerpts predate the September 2026 rewrite
The chapters below quote source as it stood before the reactivity, expression compiler, component contract, app instance and server rendering work landed. The concepts still hold; the exact code does not. For the current layout read `CLAUDE.md` in the repository root, then these files in order: `src/core/effect.js` (dependency tracking), `src/core/reactive.js` (the proxy), `src/utils/expression.js` (template expression compiler), `src/core/app.js` (`createApp`, block registration, init), `src/core/element.js` (the custom element class), `src/core/lifecycle.js` (snap and unsnap), `src/core/renderer.js` (binding scan and render), and `src/server/` (server rendering). Where a chapter and the code disagree, the code is right.
:::

This isn't a "how to use" guide. This is a **"how it works"** guide. Understanding the soul of LegoDOM will make you a better contributor.

## The Philosophy
**"The Platform is the Runtime."**

We avoid compilers, transpilers, and VDOMs. We use:
- **ES6 Modules** for organization
- **Proxies** for state
- **TreeWalkers** for scanning
- **Regex** for parsing
- **MutationObservers** for efficiency
- **Shadow DOM** for encapsulation

## The Modular Architecture

LegoDOM evolved from a 1500-line IIFE to a clean, modular ES6 codebase organized in `src/`:

```
src/
├── index.js              # The Assembler
├── core/                 # Framework core
├── directives/           # Directive implementations (b-if, b-for, etc.)  
├── features/             # Optional features (router, persistence, errors)
└── utils/                # Shared utilities
```

## The Journey

Follow the path of a block from definition to pixels:

1.  [**Module Pattern**](./01-welcome) - From IIFE to ES6 modules
2.  [**Registry**](./02-registry) - The block storage system
3.  [**Batcher**](./03-batcher) - Render queue & RAF optimization
4.  [**Reactivity**](./04-reactivity) - Proxy-based state management
5.  [**Caching**](./05-caching) - LRU expression cache
6.  [**Init**](./06-init) - How LegoDOM wakes up
7.  [**Registry**](./07-observer) - Native Web Components Integration
8.  [**Snap**](./08-snap) - The lifecycle & Shadow DOM
9.  [**Diffing**](./09-diffing) - No VDOM? No problem
10. [**Studs**](./10-studs) - The three-tier data system
11. [**Scanner**](./11-scanner) - Template parsing (Regex vs AST)
12. [**Render**](./12-render) - The "Loop of Truth" & Security
13. [**Directives**](./13-directives) - Extracted directive system
14. [**Events**](./14-events) - Event handling & modifiers
15. [**Router**](./15-router) - The "Surgical" Update philosophy
16. [**State**](./16-state) - Global state & $db
17. [**LegoDOM**](./17-legodom) - The public API
18. [**Directive Lifecycle**](./18-directive-lifecycle) - Scan, Execute, Destroy

Dive in.
