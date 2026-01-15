# Frequently Asked Questions

Quick answers to the most common LegoDOM questions.

## Project Setup

### Where do I define my routes?

**In your entry file (`app.js` or `main.js`), before `Lego.init()`.**

```javascript
// src/app.js
import { Lego } from 'lego-dom';
import registerComponents from 'virtual:lego-components';

registerComponents();

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
| Component registration | `registerComponents()` |
| Route definitions | `Lego.route(...)` |
| Global state init | `Lego.globals.user = null` |
| Engine start | `Lego.init()` |

### Should I use `main.js` or `app.js`?

Either works! It's just a naming convention. Use whatever your Vite template created, or rename it. Just make sure your `index.html` points to it:

```html
<script type="module" src="/src/app.js"></script>
```

---

## Components

### Why isn't my component showing?

Check these common issues:

1. **No route defined** – Did you add `Lego.route('/', 'my-component')`?
2. **Missing `<lego-router>`** – Your HTML needs `<lego-router></lego-router>`
3. **Wrong component name** – Filename `user-card.lego` → component `<user-card>`
4. **Not registered** – Did you call `registerComponents()` before `init()`?

### Why do component names need hyphens?

It's a Web Components standard! Custom elements must contain a hyphen to avoid conflicts with future HTML elements.

✅ Valid: `user-card`, `app-nav`, `my-button`  
❌ Invalid: `usercard`, `Card`, `button`

### Can I use PascalCase filenames?

Yes! LegoDOM automatically converts:
- `UserCard.lego` → `<user-card>`
- `AppNav.lego` → `<app-nav>`
- `my_component.lego` → `<my-component>`

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

// In the target component
mounted() {
  console.log(Lego.globals.selectedUser.name);  // 'John'
}
```

Or use route parameters:

```javascript
// Route: Lego.route('/users/:id', 'user-profile')
this.$go('/users/42').get();

// In user-profile component
mounted() {
  const userId = this.$route.params.id;  // '42'
}
```

---

## State

### How do I share data between components?

Use `Lego.globals`:

```javascript
// Component A sets it
Lego.globals.user = { name: 'John' };

// Component B reads it
console.log(Lego.globals.user.name);  // 'John'

// In templates
<p>Hello, [[ global.user.name ]]!</p>
```

### Why isn't my data updating the view?

Make sure you're mutating the reactive object, not replacing references:

```javascript
// ✅ This works - mutating property
this.items.push(newItem);
this.user.name = 'Jane';

// ❌ This might not work - reassigning local variable
let items = this.items;
items.push(newItem);  // Won't trigger re-render!
```

---

## Styling

### What is `self` in styles?

`self` is a special keyword that targets the component's root element (like `:host` in Shadow DOM):

```html
<style>
  self {
    display: block;
    padding: 1rem;
  }
</style>
```

LegoDOM automatically transforms this to `:host` for Shadow DOM.

### Do styles leak to other components?

No! Styles are scoped via Shadow DOM. Your `.button` class won't affect buttons in other components.

---

## Build & Development

### Can I use LegoDOM without Vite?

Yes! Use the CDN approach:

```html
<script src="https://unpkg.com/lego-dom/main.js"></script>
<template b-id="my-component">...</template>
<my-component></my-component>
<script>Lego.init();</script>
```

See [CDN Usage](/guide/cdn-usage) for details.

### Why use Vite?

Benefits of Vite + `.lego` files:
- **Hot reload** – Changes appear instantly
- **Auto-discovery** – No manual component registration
- **Better organization** – One file per component
- **Syntax highlighting** – Editor support for `.lego` files

---

## Still Stuck?

- 📖 [Complete Tutorial](/tutorial/) – Build an app step-by-step
- 💬 [GitHub Discussions](https://github.com/rayattack/LegoDOM/discussions)
- 🐛 [Report Issues](https://github.com/rayattack/LegoDOM/issues)
