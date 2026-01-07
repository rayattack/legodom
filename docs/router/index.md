
# LegoDOM vs Traditional SPA Router

Traditional Single Page Application (SPA) routers (like React Router, Vue Router, or Angular's Router) rely on a **Centralized Configuration Tree**. As your project grows, this JSON or JavaScript object becomes a "source of truth" that is fragile, hard to maintain, and forces a rigid hierarchy on your UI.

**LegoJS breaks this pattern.**

In Lego, we don't nest routes in a config file. Instead, we use the **URL as the Data Source** and the **DOM as the Layout Engine**.

## The Shift in Thinking

|Concept | Traditional SPAs | LegoDOM |
|-----------|---------------|--------|
| **Route Map** | Nested JSON Objects | Flat Component List |
| **Nesting** | Defined in JS | Defined by your HTML structure |
| **UI Updates** | "Nuclear" (Re-renders parent + children) | "Surgical" (Swaps exactly one fragment"|
| **State** | Lost unless lifted to Global Store | Persists naturally in unaffected siblings |


## The "Flat Route" Philosophy

In a large project, your route definitions should remain a flat list of "Shells" (Layouts).

```js
// A flat list of structural shells
Lego.route('/', 'home-shell');
Lego.route('/messaging', 'messaging-shell');
Lego.route('/messaging/:id', 'messaging-shell');
Lego.route('/settings', 'settings-shell');

```

By pointing `/messaging` and `/messaging/:id` to the same **Shell**, you are telling Lego: _"I want the same layout for both URLs, but I'll decide how to fill the holes inside the component based on the URL parameters."_

## Why This Scales

In a LinkedIn-sized project, a traditional router would need to know that the `ChatWindow` is a child of the `MessagingLayout`. If you wanted to move that `ChatWindow` to the `HomeLayout`, you’d have to refactor your entire route tree.

In Lego, you just change the **Target**. Because the components are agnostic, they don't care who their parent is. They just care about where the `b-target` tells them to go.

### Defining with SFCs

Instead of defining logic and templates in separate JavaScript strings, we use Single File Components via the `<template>` tag. This keeps our architectural "Shells" clean and readable.

```html
<template b-id="home-shell">
  <div class="layout">
    <nav-bar></nav-bar>
    <lego-router></lego-router> <!-- The global outlet -->
  </div>
</template>

```

### Key Vocabulary for the Tutorial

Throughout this guide, we will refer to three primary concepts:

1.  **The Shell**: The high-level SFC that provides the grid, navigation, and sidebar.
    
2.  **The Fragment**: A self-contained SFC (like a chat thread or a profile header) that is surgically injected into a shell.
    
3.  **The Target**: A CSS selector, Tag Name, or ID that acts as the "destination hole" for a fragment.
    

## What's Next?

We will move away from the theory and look at **Basic Routing**. We'll see how the `<lego-router>` element acts as the default gateway for your application and how Lego identifies which component to mount when the page first loads.
