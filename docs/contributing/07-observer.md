# Big Brother is Watching (Native Web Components)

In Topic 6, we saw that `Lego.init()` sets up the system. Now, let's look at exactly how detection works. This is what makes LegoDOM feel "automatic"-you can inject HTML into the page using vanilla JavaScript, and Lego will instantly recognize it and bring it to life.

## Native Web Components

LegoDOM uses the browser's native `customElements` API. It creates a lightweight Custom Element definition for every block you register.

## Location in the Codebase

The setup is in `src/index.js` within `Lego.block()`:

```js
if (!customElements.get(tagName)) {
  customElements.define(tagName, class extends HTMLElement {
    connectedCallback() {
      if (registry[tagName]) snap(this);
    }
    disconnectedCallback() {
      unsnap(this);
    }
  });
}
```

## 1. The Registration

When you call `Lego.block()`, LegoDOM tells the browser: "Whenever you see this tag, use this behavior."

## 2. Processing `addedNodes` (`connectedCallback`)

Whenever a new piece of HTML is injected (via `innerHTML`, `appendChild`, `b-if`, etc.), the browser automatically fires the `connectedCallback` lifecycle method on the element.

-   **The Action**: It calls `snap(this)` from `src/core/lifecycle.js`. This triggers the entire initialization process: attaching the Shadow DOM, creating reactive state, and rendering the template.

## 3. Processing `removedNodes` (`disconnectedCallback`)

When an element is deleted from the page, the browser fires `disconnectedCallback`.

-   **The Action**: It calls `unsnap(this)` from `src/core/lifecycle.js`.
-   **Cleanup**: Stops timers, closes connections, and prevents memory leaks.

## Why this is superior

In older versions (and many frameworks), the framework has to constantly scan the DOM or use a heavy `MutationObserver` to find changes. By using standard **Web Components**, LegoDOM lets the browser do the heavy lifting. Detection is faster, works inside Shadow DOMs automatically, and is standard-compliant.
