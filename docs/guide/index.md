# What is Lego?

LegoDOM is a tiny, zero-dependency JavaScript library for building reactive Web Components directly in the browser.

## The Philosophy

LegoDOM is built on a simple belief: **the DOM is not your enemy**.

Modern frameworks introduced virtual DOMs and compilation steps to solve problems that arose from trying to make the DOM do things it wasn't designed for. Lego takes a different approach—it embraces the DOM and Web Components as they were intended to be used.

## Key Principles

### 1. Mental Model Simplicity

There are no new concepts to learn. If you know:
- HTML
- JavaScript objects
- Basic DOM events

You already know Lego.

### 2. No Build Step Required

Drop a `<script>` tag in your HTML and you're ready to go. Build tools are optional, not mandatory.

### 3. True Reactivity

Change an object → the DOM updates. That's it. No `setState`, no `dispatch`, no `computed properties` to configure.

```js
// This just works
component._studs.count++;
```

### 4. Web Standards First

Lego uses:
- **Web Components** - Standard custom elements
- **Shadow DOM** - Native encapsulation
- **ES6 Proxies** - For reactivity
- **Template literals** - For templating

No proprietary APIs. Everything is built on web standards.

## When to Use Lego

### ✅ Lego is Great For:

- **Small to medium applications** where framework overhead isn't worth it
- **Embedded widgets** that need to work anywhere
- **Progressive enhancement** of existing sites
- **Learning** how reactive systems work under the hood
- **Projects** where you want full control and no dependencies

### ⚠️ Consider Alternatives If:

- You need a massive ecosystem of pre-built components
- Your team is already invested in React/Vue/Angular
- You need SSR (Server-Side Rendering) out of the box
- You're building something extremely complex with hundreds of components

## How Small Is It?

The core library (`main.js`) is **under 500 lines** of well-commented JavaScript.

- **No dependencies** - Zero `node_modules` bloat
- **~17KB** - Unminified, human-readable code
- **~6KB** - Minified and gzipped

Compare that to:
- Vue 3: ~33KB (minified + gzipped)
- React + ReactDOM: ~40KB (minified + gzipped)
- Angular: ~100KB+ (minified + gzipped)

## What Makes It Different?

| Aspect | Lego | Traditional Frameworks |
|--------|--------|----------------------|
| **Reactivity** | Direct object mutation | setState / dispatch / ref() |
| **Templates** | HTML with `{{ }}` | JSX / template syntax |
| **Styles** | Shadow DOM (native) | CSS-in-JS / scoped CSS |
| **Build** | Optional | Required |
| **Learning Curve** | Hours | Days/Weeks |
|**Philosophy** | Embrace the platform | Abstract the platform |

## Next Steps

Ready to dive in? Head to the [Getting Started](/guide/getting-started) guide to build your first component in under 5 minutes.
