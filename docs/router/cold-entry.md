
# The Cold Start: Self-Healing Layouts

In the previous section, we learned how to use `b-target` to surgically swap fragments while the app is running. But what happens when a user types `myapp.com/messaging/123` directly into the address bar or hits **Refresh (F5)**?

In a traditional nested router, the framework handles this automatically. In LegoJS, we use a more powerful, explicit pattern called **Self-Healing Layouts**.

## The Cold Entry/Start Challenge

When a "Cold Start" occurs:

1.  The browser requests the URL from the server.
    
2.  The server returns the base `index.html`.
    
3.  LegoJS matches the route `/messaging/:id` to the `messaging-shell` component.
    
4.  The `messaging-shell` mounts, but the `#chat-window` target is empty (or showing its default "Select a conversation" text).
    

The user is at the correct URL, but the **fragment** (the specific email or chat) is missing.

## The Solution: The "Self-Healing" Mounted Hook

To fix this, the Parent Shell must be responsible for "healing" its own internal state if it detects a parameter in the URL on mount.

### Step 1: Define the Shared Route

First, ensure your route configuration points both the list and the detail view to the same Shell component.

```js
Lego.route('/messaging', 'messaging-shell');
Lego.route('/messaging/:id', 'messaging-shell');

```

### Step 2: Implement the Healing Logic

Inside your `messaging-shell` component, use the `mounted()` hook to check for the presence of a parameter.

```js
Lego.define('messaging-shell', `
  <div class="layout">
    <aside class="sidebar">
      <!-- List of threads -->
    </aside>

    <main id="chat-window">
       <!-- Default content -->
       <p>Select a conversation.</p>
    </main>
  </div>
`, {
  mounted() {
    // Check if we arrived here via a deep-link (e.g., /messaging/123)
    if (this.$params.id) {
      // SURGICAL HEALING:
      // Tell Lego to render the current URL into the local target.
      // This pulls the 'messaging-details' fragment into the main window.
      this.$go(window.location.pathname, '#chat-window');
    }
  }
});

```

## Why This Pattern is Superior

1.  **Explicit Control**: You decide exactly when and how the child fragment appears.
    
2.  **Layout Persistence**: The Sidebar and Header are rendered immediately. The user sees the "Shell" instantly, while the specific data fragment "pops" in a few milliseconds later. This improves the **Perceived Performance**.
    
3.  **No Nested Config Hell**: You don't need a complex tree of routes. The DOM structure of your shell defines the nesting naturally.
    

## Using Slots for Better Defaults

You can use the native `<slot>` tag inside your target area to provide a better "Loading" or "Empty" experience before the healing happens.

```html
<main id="chat-window">
  <slot>
    <div class="skeleton-loader">Loading your message...</div>
  </slot>
</main>

```

## Summary

"Self-Healing" is the bridge between a static website and a dynamic application. It ensures that your surgical routing works perfectly even on hard refreshes. By using the `mounted()` hook and the `$go` helper, your components become intelligent enough to manage their own internal layout based on the global URL state.
