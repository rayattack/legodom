# Big Brother is Watching

In Topic 6, we saw that Lego.init() sets up a "watchdog." Now, let's look at exactly how that watchdog functions. This is what makes the library feel "automatic"—you can inject HTML into the page using vanilla JavaScript, and Lego will instantly recognize it and bring it to life.

## Mutation Observer

The `MutationObserver` is a built-in browser API that provides the ability to watch for changes being made to the DOM tree. In this library, it acts as the "Event Loop" for component lifecycles.

### 1. The Configuration

The library observes the `document.body` with specific settings:

```js
observer.observe(document.body, { childList: true, subtree: true });

```

-   **`childList: true`**: Tells the observer to watch for elements being added or removed.

-   **`subtree: true`**: This is vital. Without this, the library would only see things added directly to the `<body>`. With it, the library sees changes happening deep inside nested divs or other components.


### 2. Processing `addedNodes`

Whenever a new piece of HTML is injected (via `innerHTML`, `appendChild`, etc.), the observer receives a list of `addedNodes`.

-   **Filter**: The library checks `n.nodeType === Node.ELEMENT_NODE` to ensure it is an **Element** (like a `<div>` or `<my-comp>`) and not just a fragment of text.

-   **The Action**: It calls `snap(n)`. This triggers the entire initialization process: attaching the Shadow DOM, creating reactive state, and rendering the template.


### 3. Processing `removedNodes`

When an element is deleted from the page, the observer catches it in `removedNodes`.

-   **Cleanup**: It calls `unsnap(n)`.

-   **Lifecycle Hook**: `unsnap` checks the component's state for an `unmounted` function. This allows you to perform cleanup, like stopping timers or closing WebSocket connections, preventing memory leaks.


### Why this is superior to manual initialization
In most frameworks, you have to tell the library when you’ve changed the page (e.g., calling `root.render()`). This library turns that upside down by using the browser's native **MutationObserver** to watch the DOM and react automatically.
Unlike some libraries where adding a button via `innerHTML` requires a manual "re-scan" or "re-bind" call, this setup makes LegoDOM **reactive to the DOM itself**: the moment a tag like `<user-card>` appears in the document, it is automatically detected and upgraded into a functional, living component.

### 1. The Strategy: "Observe Once, Act Everywhere"

The library sets up a single observer on `document.body`.

-   **`childList: true`**: This tells the observer to watch for the addition or removal of direct children.

-   **`subtree: true`**: This is the "secret sauce." It extends the observation to the entire DOM tree. If you have a deeply nested `div` and you inject a Lego component into it, the observer will see it.


### 2. The Logic Loop: Added Nodes

When the observer detects changes, it provides a list of `MutationRecord` objects. The library loops through these records specifically looking for `addedNodes`.

-   **Type Filtering**: It checks `n.nodeType === Node.ELEMENT_NODE`. This ensures the library ignores text changes or comments and only focuses on **Elements** (tags).

-   **The Upgrade (Snapping)**: For every new element found, it calls `snap(n)`. This is why you can do `document.body.innerHTML += '<my-counter></my-counter>'` in the console, and the counter will immediately start working.


### 3. The Logic Loop: Removed Nodes

This is equally important for "garbage collection." When an element is deleted, it appears in `removedNodes`.

-   **The `unsnap` Trigger**: The library calls `unsnap(n)`.

-   **Lifecycle Cleanup**: Inside `unsnap`, the library looks for a developer-defined `unmounted` function. This is where you'd kill `setInterval` timers or close database connections. Without this, your app would suffer from "Memory Leaks"—processes that keep running even though the component is gone.
