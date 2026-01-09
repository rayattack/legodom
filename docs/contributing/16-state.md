# Lego and the Brain
In Lego, the code is designed to allow a component in the footer to talk to a component in the header without them ever being "parents" or "children" of each other.

## Global State (`Lego.globals`) & The Observer Pattern



### 1. The "Why": Decoupling the Hierarchy

In most frameworks, data flows down like a waterfall. If a deeply nested component needs a piece of data, every parent above it must "pass it down." The code in `main.js` avoids this by creating a centralized, reactive hub.

### 2. The Implementation: The "Universal Proxy"

When you define `Lego.globals`, the library doesn't just store your object. It wraps the entire thing in the same `reactive()` proxy used for individual components.

-   **The Code**: `Lego.globals = reactive(userDefinedGlobals, null)`.
    
-   **The Magic of `null`**: Notice that when a component's state is made reactive, we pass the `el` (the element) so it knows what to render. When we create `Lego.globals`, we pass `null`. This tells the proxy: "You don't belong to one element; you belong to everyone".
    

### 3. The `$global` Prefix and Subscriptions

The library uses a specific naming convention to trigger its "Global Watcher" logic. Whenever the `render()` engine or a `b-sync` sees a variable starting with `$`, it knows to ignore the local component state (`_studs`) and look into `Lego.globals` instead.

-   **The Subscription Logic**: In the `render()` function, if a global is accessed, the code automatically adds that component to a "Global Subscribers" list.
    
-   **The Update Loop**: When you change a global (e.g., `Lego.globals.theme = 'dark'`), the Proxy's `set` trap fires. Because this proxy is global, it iterates through **every single component** currently on the page and tells them to check if they need a re-render.
    

### 4. Why `Object.defineProperty` is avoided for Globals

The library sticks to **Proxy** for globals because it allows for **dynamic property addition**.

-   In older libraries, you had to declare all your global variables upfront.
    
-   Because Lego uses a Proxy, you can do `Lego.globals.newVar = 'surprise'` at runtime, and the library will immediately catch that "set" operation and notify all components, even though `newVar` didn't exist when the app started.
    

### 5. The `$go` and Globals Synergy

This is where the code becomes a "system." When you use `$go` to swap a component (Topic 17), the new component is born, it scans its HTML, sees a `$user` variable, and "subscribes" to the global state.

-   This allows for **Persistent Identity**: The user's name stays in the header because the header is subscribed to `Lego.globals.user`, even as the rest of the page is being torn down and rebuilt by the router.
    

----------

**Summary**: The code uses a "Centralized Proxy" to bypass the DOM hierarchy, ensuring that data is shared via subscription rather than inheritance.
