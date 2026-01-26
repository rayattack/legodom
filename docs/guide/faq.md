# Frequently Asked Questions

Quick answers to the most common LegoDOM questions.

## Project Setup

### Where do I define my routes?

**In your entry file (`app.js` or `main.js`), before `Lego.init()`.**

```javascript
// src/app.js
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

// Define routes HERE ⭐
Lego.route('/', 'home-page');
Lego.route('/login', 'login-page');
Lego.route('/users/:id', 'user-profile');

await Lego.init();  // Must come AFTER routes
```

### Where does my config go?

Everything related to app configuration belongs in your entry file:

| What | Where |
|------|-------|
| Block registration | `registerBlocks()` |
| Route definitions | `Lego.route(...)` |
| Global state init | `Lego.globals.user = null` |
| Engine start | `Lego.init()` |

### Should I use `main.js` or `app.js`?

Either works! It's just a naming convention. Use whatever your Vite template created, or rename it. Just make sure your `index.html` points to it:

```html
<script type="module" src="/src/app.js"></script>
```

---

## Blocks

### Why isn't my block showing?

Check these common issues:

1. **No route defined** – Did you add `Lego.route('/', 'my-block')`?
2. **Missing `<lego-router>`** – Your HTML needs `<lego-router></lego-router>`
3. **Wrong block name** – Filename `user-card.lego` → block `<user-card>`
4. **Not registered** – Did you call `registerBlocks()` before `init()`?

### Why do block names need hyphens?

It's a Web Components standard! Custom elements must contain a hyphen to avoid conflicts with future HTML elements.

✅ Valid: `user-card`, `app-nav`, `my-button`  
❌ Invalid: `usercard`, `Card`, `button`

### Can I use PascalCase filenames?

Yes! LegoDOM automatically converts:
- `UserCard.lego` → `<user-card>`
- `AppNav.lego` → `<app-nav>`
- `my_block.lego` → `<my-block>`

---

## Navigation

### How do I navigate between pages?

**Option 1: Declarative (in templates)**
```html
<a href="/login" b-link>Go to Login</a>
```

**Option 2: Programmatic (in JavaScript)**
```javascript
this.$go('/login').get();
```

### What's the difference between `b-link` and `b-target`?

| Attribute | What it does |
|-----------|--------------|
| `b-link` | SPA navigation, updates URL, swaps `<lego-router>` |
| `b-target="#id"` | Swaps content of specific element, updates URL |
| `b-target="#id" b-link="false"` | Swaps content, does NOT update URL |

### How do I pass data when navigating?

Use global state:

```javascript
// Before navigating
Lego.globals.selectedUser = { id: 42, name: 'John' };
this.$go('/user-details').get();

// In the target block
mounted() {
  console.log(Lego.globals.selectedUser.name);  // 'John'
}
```

Or use route parameters:

```javascript
// Route: Lego.route('/users/:id', 'user-profile')
this.$go('/users/42').get();

// In user-profile block
mounted() {
  const userId = this.$route.params.id;  // '42'
}
```

---

## State

### How do I share data between blocks?

Use `Lego.globals`:

```javascript
// Block A sets it
Lego.globals.user = { name: 'John' };

// Block B reads it
console.log(Lego.globals.user.name);  // 'John'

// In templates
<p>Hello, [[ global.user.name ]]!</p>
```

### Why isn't my data updating the view?

Make sure you're mutating the reactive proxy, not a detached reference:

```javascript
// ✅ This works - mutating the reactive state directly
this.items.push(newItem);
this.user.name = 'Jane';

// ⚠️ Be careful with local copies
let items = this.items;  // 'items' is still reactive (same proxy)
items.push(newItem);     // ✅ This actually works fine!

// ❌ This WON'T work - creating a non-reactive copy
let items = [...this.items];  // Spread creates a plain array
items.push(newItem);          // Won't trigger re-render
```

---

## Styling

### What is `self` in styles?

`self` is a special keyword that targets the block's root element (like `:host` in Shadow DOM):

```html
<style>
  self {
    display: block;
    padding: 1rem;
  }
</style>
```

LegoDOM automatically transforms this to `:host` for Shadow DOM.

### Do styles leak to other blocks?

No! Styles are scoped via Shadow DOM. Your `.button` class won't affect buttons in other blocks.

### How do I load external CSS with `b-stylesheets`?

**Recommended: Use the `/public/` directory**

Place your CSS files in the `public/` folder of your project:

```
/public/
  /styles/
    theme.css
    base.css
```

Then reference them with absolute paths:

```javascript
Lego.init(document.body, {
  styles: {
    'main-theme': ['/styles/theme.css', '/styles/base.css']
  }
});
```

**Why `/public/`?** Vite serves files from `public/` as static assets without transformation, ensuring LegoDOM receives raw CSS instead of JavaScript modules.

::: warning Important
CSS files **must** be placed in `/public/` when using Vite. Placing them in `src/` will cause Vite to serve them as JavaScript modules, which will break stylesheet loading.
:::

### How do I prevent Flash of Unstyled Content (FOUC)?

If you see unstyled content briefly before your styles load (especially with external stylesheets like Tailwind), use the **Visibility Hatch**.

LegoDOM automatically adds a `b-id` attribute to every block once it is fully initialized (Shadow DOM attached, styles applied, rendered). You can use this to hide blocks until they are ready:

**In your global CSS (e.g., `index.html`):**

```css
/* Hide only Undefined Custom Elements that haven't been snapped yet */
:not(:defined):not([b-id]) {
  opacity: 0 !important;
  visibility: hidden;
}

/* Ensure defined elements are visible */
[b-id] {
  opacity: 1 !important;
  visibility: visible;
  transition: opacity 0.2s ease-in;
  display: block;
}
```

This ensures a smooth fade-in for your application.

---

## Build & Development

### Can I use LegoDOM without Vite?

Yes! Use the CDN approach:

```html
<script src="https://unpkg.com/lego-dom/main.js"></script>
<template b-id="my-block">...</template>
<my-block></my-block>
<script>Lego.init();</script>
```

See [CDN Usage](/guide/cdn-usage) for details.

### Why use Vite?

Benefits of Vite + `.lego` files:
- **Hot reload** – Changes appear instantly
- **Auto-discovery** – No manual block registration
- **Better organization** – One file per block
- **Syntax highlighting** – Editor support for `.lego` files

---

## Still Stuck?

- 📖 [Complete Tutorial](/tutorial/) – Build an app step-by-step
- 💬 [GitHub Discussions](https://github.com/rayattack/LegoDOM/discussions)
- 🐛 [Report Issues](https://github.com/rayattack/LegoDOM/issues)
