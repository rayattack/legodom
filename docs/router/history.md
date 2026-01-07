
# 05. Smart History & The Back Button

One of the biggest frustrations in modern web development is "breaking the back button." When you use JavaScript to update only part of a page, the browser often doesn't realize a navigation event occurred. If the user hits "Back," they might be booted out of your app entirely.

LegoJS solves this using a system called **Smart History**. It ensures that even surgical, fragment-level updates are recorded and reversible.

## How Traditional Routers Fail

In a standard SPA, the router usually manages a single "current view." When you navigate:

1.  The URL changes.
    
2.  The old component is destroyed.
    
3.  The new component is mounted.
    

Because the whole page (or the main outlet) is replaced, the browser's history stack is simple: Page A -> Page B. But in a complex layout like LinkedIn, you might have changed the chat window 5 times while the sidebar stayed exactly the same. Users expect the "Back" button to cycle through those chats, not take them back to the login screen.

## The LegoJS Approach: Target Tracking

When you use `b-link` with a `b-target`, LegoJS does two things simultaneously:

1.  It updates the browser URL using the History API.
    
2.  It stores a "snapshot" of the target information in the history state.
    

### Inside the History State

Every time a surgical swap happens, LegoJS saves the target selector in the `history.state`. It looks something like this:

```
// Internal representation
history.pushState({ 
  legoTargets: '#chat-window' 
}, '', '/messaging/124');

```

## The "Popstate" Magic

When a user hits the **Back** or **Forward** button, the browser triggers a `popstate` event. LegoJS intercepts this event and checks if the incoming state contains `legoTargets`.

-   **If `legoTargets` exists:** LegoJS performs a surgical swap. It takes the URL the browser is moving to and renders it _only_ into the specified target (e.g., `#chat-window`).
    
-   **If no target exists:** It performs a global swap in the `<lego-router>`.
    

## Why This Matters for User Experience

### 1. Persistence of Sibling State

Because only the target is swapped during history navigation, your sidebar remains untouched. If the user had scrolled halfway down a list of 500 emails, they stay exactly at that scroll position as they hit "Back" and "Forward" to view different email details.

### 2. Zero-Config History

You don't have to write a single line of code to make the back button work. As long as you are using `b-link` and `b-target`, the framework handles the history reconciliation automatically.

### 3. Deep Link Consistency

Because the history state uses the same URLs as your standard links, a "Back" navigation and a "Hard Refresh" result in the same UI state (thanks to the Self-Healing logic we covered in the previous section).

## Summary

Smart History is the "glue" that makes a multi-fragment interface feel like a single, cohesive application. It respects the user's intent by making the browser's navigation tools work for specific parts of the page, not just the whole page.

Next, we'll dive into the mechanics of how LegoJS finds these targets in complex, nested DOM trees in **Target Resolver: Scoping and Logic**.
