# Layouts & Composition

LegoDOM leverages native Web Component **Slots** to create powerful, reusable layouts. Because valid Lego blocks are standard Web Components with Shadow DOM, you can use `<slot>` to allow content projection while keeping your routing simple.

## The App Shell Pattern

The most common pattern is wrapping your router in an "App Shell" that provides persistent UI (Sidebar, Header, Footer) while letting the router swap the content area.

### 1. Create the Shell

Create a block that defines your layout structure and includes a `<slot>` for the main content.

```html
<!-- src/app-shell.lego -->
<!-- The Magic: b-cascade passes 'tailwind' down to children (like the router views) -->
<template b-stylesheets="tailwind main" b-cascade="tailwind">
  <div class="flex min-h-screen">
    <aside class="w-64 border-r border-gray-200">
      <side-menu></side-menu>
    </aside>
    
    <main class="flex-1 p-8">
      <!-- The router (or page) will be projected here -->
      <!-- Because of b-cascade, it will receive the tailwind styles -->
      <slot></slot>
    </main>
  </div>
</template>

<style>
  /* Local overrides if needed, but mostly utilizing Tailwind utility classes */
</style>
```

### The Strategy: Cascade = Inheritance
By adding `b-cascade="tailwind"` to your shell, you unlock "Global Styles" for your entire app.
1.  **Define** `tailwind` in `Lego.init({ styles: { tailwind: '...' } })`.
2.  **Cascade** it from `<app-shell>`.
3.  **Use** utility classes in any page rendered by the router.

This gives you the best of both worlds: Shadow DOM encapsulation by default, with opt-in global inheritance where it makes sense.

### 2. Wrap the Router

In your `index.html`, simply wrap `<lego-router>` with your shell.

```html
<!-- index.html -->
<body>
  <app-shell>
    <!-- accessible in Light DOM, projected into Shadow DOM slot -->
    <lego-router></lego-router>
  </app-shell>
  
  <script type="module" src="./src/app.js"></script>
</body>
```

**Why this works:**
- `<lego-router>` remains in the **Light DOM**, so `Lego.init()` and the router can easily find it (`document.querySelector('lego-router')`).
- `<app-shell>` renders its own Shadow DOM (sidebar, layout structure).
- The router is "projected" into the `<slot>` position inside the shell.

---

## Authentication Wrapper

You can create blocks that conditionally render slots based on state, effectively acting as "Guards" or "Wrappers".

```html
<!-- src/auth-guard.lego -->
<template>
  <!-- If authenticated, show the content (the slot) -->
  <div b-if="isAuthenticated">
    <slot></slot>
  </div>

  <!-- If not, show the login page -->
  <login-page b-if="!isAuthenticated"></login-page>
</template>

<script>
export default {
  // Bind to a global auth token in $db
  isAuthenticated: $db('auth_token').default(null)
}
</script>
```

**Usage:**

```html
<!-- index.html -->
<auth-guard>
  <app-shell>
    <lego-router></lego-router>
  </app-shell>
</auth-guard>
```

This ensures the entire app (shell + router) is only rendered if the user is authenticated.

---

## Multiple Slots (Advanced Layouts)

Native Shadow DOM allows for **Named Slots**, letting you plug content into specific areas of a layout.

### The Layout

```html
<!-- src/dashboard-layout.lego -->
<template>
  <div class="dashboard">
    <header class="top-bar">
      <slot name="header"></slot>
    </header>
    
    <div class="body">
      <nav class="side-nav">
        <slot name="sidebar"></slot>
      </nav>
      
      <main class="main-area">
        <slot name="content"></slot>
      </main>
    </div>
  </div>
</template>
```

### The Usage

```html
<dashboard-layout>
  <user-profile slot="header"></user-profile>
  <nav-menu slot="sidebar"></nav-menu>
  <lego-router slot="content"></lego-router>
</dashboard-layout>
```

---

## Nested Layouts

Since everything is a component, you can nest layouts arbitrarily.

```html
<auth-guard>
  <app-shell>
    <!-- Settings has its own sub-layout -->
    <settings-layout slot="main">
       <lego-router></lego-router>
    </settings-layout>
  </app-shell>
</auth-guard>
```

## Key Benefits

1.  **No Router Complexity**: You don't need "nested routes" or complex router configuration. The DOM hierarchy *is* your layout configuration.
2.  **Native Performance**: Slots are a native browser feature. Projection is virtually free.
3.  **Encapsulation**: Layouts manage their own styles (Shadow DOM) but can share global styles via `b-cascade`.
4.  **Separation of Concerns**: Your router maps URLs to Pages. Your Layouts map Pages to Structure.

> [!TIP]
> Always use `b-cascade` on your layout shells if you want them to inherit global styles (like resets or frameworks) defined in `Lego.init()`.

```html
<template b-stylesheets="bulma" b-cascade="bulma">
  <!-- Styles now available inside the shell -->
</template>
```
