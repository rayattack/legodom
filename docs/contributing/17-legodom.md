# Mama "We Made It!"
Everything we’ve discussed i.e. the Scanner, the Registry, the Router, and the Snap etc. "Everything" stays dormant until `Lego.init()` is called. This function is not just a starter; it’s an orchestrator that synchronizes the JavaScript environment with the existing HTML on the page.

## The Lego Initializer

The code for `init()` is deceptively small because its primary job is to flip the switches on the systems we've already built.

### 1. Bootstrapping the Watchdog

The core of the initialization is setting up the `MutationObserver` we discussed in Topic 7.

-   **The Target**: It targets `document.body`.
    
-   **The Configuration**: It uses `{ childList: true, subtree: true }`.
    
-   **The Why**: By starting the observer _before_ the first render, the library ensures that any elements it creates during the initial startup are also caught and "snapped" into life.
    

### 3. The "Initial Snap" (The Recursive Wake-up)

Once the observer is live, the code calls `snap(document.body)`.

-   **The Why**: The `MutationObserver` only sees _new_ changes. It cannot see the HTML that was already there when the page loaded.
    
-   **The Logic**: By manually calling `snap` on the body, the library recursively walks through your entire server-rendered HTML. It finds every custom tag (e.g., `<user-card>`) and "upgrades" them into components.
    

### 4. Activating the Global Listener

This is where the **Router Hijack** (Topic 17) is installed.

-   The code adds a single click listener to the `window`.
    
-   **The Why**: Instead of attaching listeners to every individual `<a>` tag (which would be slow and break when new links are added), it uses **Event Delegation**. It waits for clicks to bubble up to the window, checks if they are `b-link` clicks, and then decides whether to trigger the router.
    

### 5. The First Route Check

Finally, `init()` calls `router()` manually for the first time.

-   **The Why**: If a user navigates directly to `mysite.com/dashboard`, the browser loads the page, but the JavaScript needs to know which component to put into the `router-view` immediately. This manual call ensures the UI matches the URL on the very first frame.
    

----------

**The Architecture "Why"**: Lego is designed to be **Zero-Config**. By putting all these steps into `init()`, the developer only has to care about one thing: "When is my DOM ready?" The code handles the complex timing of making sure the Watchdog is looking while the Router is switching and the Snap is initializing.

**Summary**: `Lego.init()` is the bridge. It turns a static document into a reactive application by starting the observer, snapping the existing HTML, and hijacking the navigation.
