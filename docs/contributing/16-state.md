# Lego and the Brain
In Lego, the code is designed to allow a component in the footer to talk to a component in the header without them ever being "parents" or "children" of each other.

## Global State (`Lego.globals`) & The Observer Pattern



### 1. The "Why": Decoupling the Hierarchy

In most frameworks, data flows down like a waterfall. If a deeply nested component needs a piece of data, every parent above it must "pass it down." The code in `main.js` avoids this by creating a centralized, reactive hub.

### 2. The Implementation: "The Body is the Root"

When you define `Lego.globals`, the library doesn't just store your object. It wraps it in the same `reactive()` proxy, but binds it to `document.body`.

-   **The Code**: `Globals = reactive(userState, document.body)`.
    
-   **The Effect**: This means the entire `<body>` is technically the "component" for global state.

### 3. The `$global` Dependency Check (Smart Broadcast)

The library uses a specific optimization to avoid re-rendering the whole world.

-   **Depenedency Tracking**: During `scanForBindings`, if the parser sees a variable that looks global (e.g. `{{ global.user }}`), it marks that specific component with a `hasGlobalDependency` flag.

-   **The Broadcast Loop**: When you change a global (e.g., `Lego.globals.theme = 'dark'`), the Proxy's `set` trap fires on `document.body`. The `render` function sees this is a global update and iterates through **activeComponents**, checking which ones have the flag. Only those components re-render.
    

### 4. Why `Object.defineProperty` is avoided for Globals

The library sticks to **Proxy** for globals because it allows for **dynamic property addition**.

-   In older libraries, you had to declare all your global variables upfront.
    
-   Because Lego uses a Proxy, you can do `Lego.globals.newVar = 'surprise'` at runtime, and the library will immediately catch that "set" operation and notify all components, even though `newVar` didn't exist when the app started.
    

### 5. The `$go` and Globals Synergy

This is where the code becomes a "system." When you use `$go` to swap a component (Topic 17), the new component is born, it scans its HTML, sees a `$user` variable, and "subscribes" to the global state.

-   This allows for **Persistent Identity**: The user's name stays in the header because the header is subscribed to `Lego.globals.user`, even as the rest of the page is being torn down and rebuilt by the router.
    

----------

**Summary**: The code uses a "Centralized Proxy" to bypass the DOM hierarchy, ensuring that data is shared via subscription rather than inheritance.
