# Surgical Routing

**Stop rebuilding your entire page just to change one div.**

LegoDOM's router is different. It doesn't have a single "Root Outlet". Instead, **any element** can be a router target. This allows you to build **Persistent Layouts** (like Sidebars, Music Players, or Chat Windows) that never reload or lose state while the user navigates.

::: tip 🚀 Just Want to Navigate Between Pages?
Here's the quick answer:

**1. Define routes in `app.js`:**
```javascript
Lego.route('/', 'home-page');
Lego.route('/login', 'login-page');
Lego.route('/dashboard', 'dashboard-page');
```

**2. Navigate with links:**
```html
<a href="/login" b-link>Go to Login</a>
```

**3. Or navigate with JavaScript:**
```javascript
this.$go('/login').get();
```

That's it! For the full tutorial, see [Adding Routes](/tutorial/03-adding-routes).
:::

## Quick Reference

| I want to... | Code |
|--------------|------|
| Define a route | `Lego.route('/path', 'component-name')` |
| Link to a page | `<a href="/path" b-link>Click</a>` |
| Navigate via JS | `this.$go('/path').get()` |
| Get URL params | `this.$route.params.id` |
| Update only one div | `<a href="/x" b-target="#myDiv">` |
| Navigate without URL change | `this.$go('/x').get(false)` |

---

## The Architecture: "The Persistent Shell"

The best way to use LegoDOM is to define a static "Shell" that holds your persistent tools, and standard outlets for your content.

```html
<body>
  <!-- 1. The Shell (Sidebar): Never reloads. Keeps scroll pos & draft state. -->
  <aside id="sidebar">
    <file-tree></file-tree>
  </aside>

  <!-- 2. The Stage (Main Content): This changes when URL changes. -->
  <lego-router id="stage"></lego-router>
  
  <!-- 3. The Context (Right Panel): Tools based on selection. -->
  <aside id="tools"></aside>
</body>
```

Then, you simply tell links *where* to render their content:

```html
<!-- Updates component in #stage (Default URL navigation) -->
<a href="/dashboard" b-target="#stage">Dashboard</a>

<!-- Updates component in #tools (Keeps URL sync, but only touches right panel) -->
<a href="/tools/settings" b-target="#tools">Settings</a>
```

This feels like a native app. The Sidebar doesn't flicker. The scroll position isn't lost.

---

## 1. Declarative Routing

The most common way to route is using standard `<a>` tags enriched with Lego attributes.

### `b-target`
Specifies the CSS selector of the element to replace.

```html
<!-- Swaps content into <div id="main-content"> -->
<a href="/profile" b-target="#main-content">Go to Profile</a>

<!-- Example of using route params in a template -->
<main>
  <blog-posts b-show="$route.params.section === 'posts'"></blog-posts>
  <blog-authors b-show="$route.params.section === 'authors'"></blog-authors>
</main>
```

### `b-link`
Controls browser history behavior.
- `b-link` (or just `b-target`): Defaults to `true` (updates URL, pushes history).
- `b-link="false"`: Does **not** update the URL. Great for tabs, modals, or side-panels.

```html
<!-- Updates URL to /settings, swaps #main -->
<a href="/settings" b-target="#main">Settings</a>

<!-- Keeps URL same, just swaps the sidebar context -->
<a href="/sidebar/tools" b-target="#sidebar" b-link="false">Open Tools</a>
```

### Deep Linking & Defaults
If a user refreshes the page, surgical targets (like `#sidebar`) usually won't have content because the `b-target` click never happened.

**The Golden Rule:** Always have a `<lego-router>` as your default "Main" outlet.
When the page loads, Lego looks for `<lego-router>` to render the URL's matching component.

```html
<body>
  <nav>...</nav>
  
  <!-- Default Outlet: Renders /home, /about, etc. -->
  <lego-router id="main-app"></lego-router>
  
  <!-- Surgical Outlet: Only updated when specifically targeted -->
  <aside id="sidebar"></aside>
</body>
```

## 2. The `$go` API

For full programmatic control, use the globally available `$go` helper. It allows for surgical updates from your JavaScript logic.

### Syntax
`Lego.globals.$go(path, ...targets)`

- **path**: The URL to navigate to (e.g., `/user/1`).
- **targets**: A list of selectors (e.g., `#main`, `#sidebar`). Passing nothing defaults to `lego-router`.

### Methods
The `$go` function returns an object with HTTP verb methods, primarily only `.get()` is relevant for routing, but others exist for consistency.

```javascript
// 1. Standard Navigation (pushes to history)
Lego.globals.$go('/profile').get();

// 2. Surgical Navigation (updates #sidebar, pushes to history)
Lego.globals.$go('/widgets/clock', '#sidebar').get();

// 3. Silent Update (updates #modal, NO history change)
// Pass `false` as the first argument to .get()
Lego.globals.$go('/modals/login', '#modal').get(false);
```

### Interactive Example: "The Shell"
You can update **multiple** targets at once (future feature) or chain them.
Commonly, you use `$go` inside your component logic:

```html
<script>
  export default {
    methods: {
      async loadUser() {
        const userId = Lego.globals.$route.params.id; // Access in JS logic
        const user = await fetch(`/api/users/${userId}`).then(r => r.json());
        this.username = user.name;
      },
      openSettings() {
        // Open settings in the sidebar without losing the main page context
        this.global.$go('/settings-panel', '#sidebar').get(false);
      }
    }
  }
</script>
```

---

## 3. Advanced Patterns

### The "Sidebar" Pattern
Keep a persistent Main Content while swapping sidebars.

```html
<nav>
  <!-- Main Nav: Updates URL and main view -->
  <a href="/dashboard" b-target="#main">Dashboard</a>
  <a href="/files" b-target="#main">Files</a>
</nav>

<main id="main">
  <!-- Dashboard or Files render here -->
</main>

<aside id="context-pane">
  <!-- Context specific tools render here -->
  <template b-id="user-profile">
    <h1>User Profile</h1>
    <p>User ID: [[ $route.params.id ]]</p>
    <button @click="loadUser()">Load User</button>
  </template>
</aside>

<!-- Inside Dashboard Component -->
<button onclick="Lego.globals.$go('/tools/chart-config', '#context-pane').get(false)">
  Configure Chart
</button>
```

### The "Modal" Pattern
Render a route into a modal dialog container.

```html
<dialog id="modal-container"></dialog>

<a href="/login" b-target="#modal-container"
   onclick="document.getElementById('modal-container').showModal()">
   Login
</a>
```

### The "Persistent Layout" Pattern (The Holy Grail)
This is where LegoDOM outshines traditional routers. You can have static sidebars that **never** reload, while the center content changes dynamically.

```html
<body>
  <!-- LEFT: Never reloads. Keeps scroll position & expanded folders. -->
  <aside id="static-left">
    <file-tree></file-tree>
  </aside>

  <!-- CENTER: The main router outlet -->
  <lego-router id="main-content"></lego-router>

  <!-- RIGHT: Context panel for tools/details -->
  <aside id="static-right"></aside>
</body>
```
*   **Main Links:** `<a href="/page" b-target="#main-content">`
*   **Tool Links:** `<a href="/tool" b-target="#static-right">`

---

## 4. Deep Routing Strategies

When handling deep routes like `/customers/:id/orders/:orderId`, you have two architectural choices.

### Option A: The Shell Strategy (Self-Healing)
Map everything to a single "Shell" component. The Shell determines what to show in its sub-outlets based on the URL params.

*   **Pros:** Highly surgical. The Shell never re-renders, only its children do.
*   **Cons:** Requires logic in `mounted()` to "heal" the state on page load.

```javascript
// Route Configuration
Lego.route('/customers/:id', 'customers-shell');
Lego.route('/customers/:id/orders/:orderId', 'customers-shell');

// Component Logic (Self-Healing)
mounted() {
  if (this.$route.params.orderId) {
    this.$go(window.location.pathname, '#details-pane').get();
  }
}
```

### Option B: The Page Strategy (Component Nesting)
Map deep routes to specific "Page" components. Each page imports and wraps itself in a shared Layout.

*   **Pros:** Simpler logic. No "healing" code required.
*   **Cons:** The Layout is technically re-created on every route change (though diffing makes it cheap).

```javascript
// Route Configuration
Lego.route('/customers/:id/orders/:orderId', 'order-details-page');
```

```html
<!-- order-details-page.lego -->
<template>
  <customers-layout>
    <order-info id="[[ $route.params.orderId ]]"></order-info>
  </customers-layout>
</template>
```

---

## 5. Middleware & Guards

Middleware runs **before** the surgical swap happens. It### Accessing Parameters
Route parameters are available directly via `$route.params` in templates.

> **Note:** `$route` is a global helper available in all templates.

```javascript
/* 
 * Middleware Signature:
 * (params: Object, globals: Object) => boolean | Promise<boolean>
 * Return `true` to allow navigation, `false` to block.
 */

// Example: Auth Guard
const requireAuth = (params, globals) => {
  if (!globals.user) {
    // Redirect to login using surgical routing!
    globals.$go('/login', '#main').get(); 
    return false; // Stop original navigation
  }
  return true;
};

Lego.route('/admin', 'admin-panel', requireAuth);
```

## 5. Smart History

Lego's router is "History Aware".
When you use `b-target`, Lego stores the target selectors in the browser's History State.

**What this means:**
1. You click "Open Sidebar" (Surgical update to `#sidebar`).
2. You click "Home" (Main update to `#main`).
3. You click **Back**.
4. Lego automatically knows to reverse the "Home" navigation.
5. You click **Back** again.
6. Lego knows the previous state was a surgical update to `#sidebar` and restores it correctly!

## Summary Table

| Feature | Code | Description |
| :--- | :--- | :--- |
| **Standard Link** | `<a href="/x">` | Standard browser navigation (full reload). |
| **SPA Link** | `<a href="/x" b-target>` | Default SPA nav. Swaps `<lego-router>`. |
| **Surgical Link** | `<a href="/x" b-target="#id">` | Swaps content of `#id`. Updates URL. |
| **Silent Link** | `... b-link="false">` | Swaps content. **No** URL update. |
| **JS Nav** | `$go('/x').get()` | Programmatic navigation. |
| **Silent JS** | `$go('/x').get(false)` | Programmatic silent swap. |

