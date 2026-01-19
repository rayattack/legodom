# Single File Blocks (.lego)

Single File Blocks (SFB) let you define blocks in dedicated `.lego` files when using Vite as your build tool.

::: tip 🚀 New to LegoDOM?
Start with our **[Step-by-Step Tutorial](/tutorial/)** to build a complete multi-page app with Lego Files!
:::

## Where Does My Config Go?

The #1 question developers ask: **"I have a `.lego` file – now where do I put my routes?"**

**Answer: Everything goes in your entry file (`app.js` or `main.js`):**

```javascript
// src/app.js – The control center of your app

import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-components'; // Plugin still uses this name for now

// 1. Register all .lego files automatically
registerBlocks();

// 2. Define your routes
Lego.route('/', 'home-page');           // home-page.lego
Lego.route('/login', 'login-page');     // login-page.lego
Lego.route('/users/:id', 'user-profile'); // user-profile.lego

// 3. Initialize global state (optional)
Lego.globals.user = null;

// 4. Start the engine
await Lego.init();
```

Your `index.html` just needs:
```html
<lego-router></lego-router>
<script type="module" src="/src/app.js"></script>
```

That's the complete pattern! 🎉

---

## Why Lego Files?

When your project grows, keeping blocks in separate files makes your codebase more organized and maintainable.

### Benefits

✅ **Better Organization** - One file per block  
✅ **Syntax Highlighting** - Proper editor support  
✅ **Auto-discovery** - Vite plugin finds and registers blocks automatically  
✅ **Hot Reload** - Changes reflect instantly during development  
✅ **Familiar Format** - Similar to Vue SFCs if you've used them

## File Format

A `.lego` file contains three optional sections:

```html
<template>
  <!-- Your block markup -->
</template>

<script>
// Your block logic
export default {
  // reactive state and methods
}
</script>

<style>
  /* Scoped styles */
</style>
```

### Example Block

Here's a complete example (`block-user-card.lego`):

```html
<template>
  <img class="avatar" src="[[ avatarUrl ]]" alt="[[ name ]]">
  <h2 class="name">[[ name ]]</h2>
  <p class="bio">[[ bio ]]</p>
  <p>Followers: [[ followers ]]</p>
  <button @click="follow()">
    [[ isFollowing ? 'Unfollow' : 'Follow' ]]
  </button>
</template>

<style>
  self {
    display: block;
    padding: 1.5rem;
    border: 2px solid #ddd;
    border-radius: 8px;
    max-width: 300px;
  }
  
  .avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
  }
  
  .name {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0.5rem 0;
  }
  
  .bio {
    color: #666;
    margin: 0.5rem 0;
  }
  
  button {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }
</style>

<script>
export default {
  name: 'John Doe',
  bio: 'Web developer & coffee enthusiast',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
  followers: 1234,
  isFollowing: false,
  
  follow() {
    if (this.isFollowing) {
      this.followers--;
      this.isFollowing = false;
    } else {
      this.followers++;
      this.isFollowing = true;
    }
  }
}
</script>
```

## Vite Plugin Setup

### Installation

```bash
npm install -D vite lego-dom
```

### Configuration

Create or update `vite.config.js`:

```js
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [
    legoPlugin({
      componentsDir: './src/blocks',  // Where to look
      include: ['**/*.lego']          // What to match
    })
  ]
});
```

### Project Structure

```
my-app/
├── src/
│   ├── blocks/
│   │   ├── block-user-card.lego
│   │   ├── block-post-list.lego
│   │   └── block-comment-item.lego
│   └── main.js
├── index.html
├── package.json
└── vite.config.js
```

### Entry Point

In your `src/main.js`:

```js
import { Lego } from 'lego-dom/main.js';
import registerBlocks from 'virtual:lego-components';

// Auto-register all discovered blocks
registerBlocks();

// Now all .lego blocks are available!
```

### Use Blocks

In your `index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Lego App</title>
</head>
<body>
  <div id="app">
    <block-user-card></block-user-card>
    <block-post-list></block-post-list>
  </div>
  
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

## Block Naming

Block names are automatically derived from filenames:

| Filename | Block Tag |
|----------|--------------|
| `block-user-card.lego` | `<block-user-card>` |
| `block-post-list.lego` | `<block-post-list>` |
| `block-comment-item.lego` | `<block-comment-item>` |

::: warning Naming Rules
Block names **must**:
- Be kebab-case (lowercase with hyphens)
- Contain at least one hyphen
- Match the pattern: `[a-z][a-z0-9]*(-[a-z0-9]+)+`

✅ Good: `block-user-card`, `block-post-list`, `nav-menu`  
❌ Bad: `UserCard`, `postlist`, `card`
:::

## Section Details

### Template Section

Contains your block's HTML markup with Lego directives:

```html
<template>
  <h1>[[ title ]]</h1>
  <p b-show="showContent">[[ content ]]</p>
  <ul>
    <li b-for="item in items">[[ item ]]</li>
  </ul>
</template>
```

### Script Section

Exports the block's reactive state and methods:

```html
<script>
export default {
  // Reactive properties
  title: 'Welcome',
  count: 0,
  items: ['apple', 'banana'],
  
  // Methods
  increment() {
    this.count++;
  },
  
  // Lifecycle hooks
  mounted() {
    console.log('Block mounted!');
  }
}
</script>
```

### Style Section

Scoped styles using Shadow DOM. Use `self` to target the block root:

```html
<style>
  self {
    display: block;
    padding: 1rem;
  }
  
  h1 {
    color: #333;
  }
  
  button {
    background: blue;
    color: white;
  }
</style>
```

Styles are automatically scoped to your block—they won't affect other blocks or global styles.

## Dynamic Styles

A powerful feature of LegoDOM Single File Blocks is that **interpolation works inside `<style>` tags too!**

You can use `[[ ]]` to bind CSS values directly to your block's state, props, or logic. Because styles are scoped (Shadow DOM), this is safe and won't leak.

```html
<template>
  <button @click="toggleTheme()">Toggle Theme</button>
</template>

<style>
  /* Use state variables directly in CSS */
  self {
    background-color: [[ theme === 'dark' ? '#333' : '#fff' ]];
    color: [[ theme === 'dark' ? '#fff' : '#000' ]];
    
    /* You can also bind strict values for calculation */
    --padding: [[ basePadding + 'px' ]];
    padding: var(--padding);
  }
</style>

<script>
export default {
  theme: 'light',
  basePadding: 20,
  
  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
  }
}
</script>
```

::: tip Why this rocks 🤘
This eliminates the need for CSS-in-JS libraries. You get full reactivity in your CSS with standard syntax.
:::

::: warning Performance Note
Binding to CSS properties works great for themes, settings, and layout changes.  
For high-frequency updates (like drag-and-drop coordinates or 60fps animations), prefer binding to **CSS Variables** on the host element (`style="--x: [[ x ]]"`) to avoid re-parsing the stylesheet on every frame.
:::

## Hot Module Replacement

During development, changes to `.lego` files trigger a full page reload. Your changes appear instantly!

```bash
npm run dev
```

Edit your block, save, and see the result immediately.

## Passing Props

Pass data to blocks via the `b-logic` attribute:

```html
<user-card b-logic="{ 
  name: 'Jane Smith', 
  bio: 'Designer', 
  followers: 5678 
}"></user-card>
```

Or define defaults in the script section and override as needed. (Legacy `b-data` is also supported).

## Best Practices

### 1. Keep Blocks Small

Each `.lego` file should represent a single, focused block.

✅ Good: `block-user-avatar.lego`, `block-user-name.lego`  
❌ Bad: `entire-profile-page.lego`

### 2. Use Semantic Names

Name blocks after what they represent, not how they look.

### 3. Organize by Feature

```
blocks/
├── user/
│   ├── block-user-card.lego
│   └── block-user-profile.lego
├── shared/
│   └── block-app-button.lego
```

## Limitations

- `.lego` files require Vite
- Each file creates exactly one block
- Block name is derived from filename

## Comparison: Lego File vs Traditional

### Traditional (HTML Template)

```html
<template b-id="my-block">
  <style>self { padding: 1rem; }</style>
  <h1>[[ title ]]</h1>
</template>

<my-block b-logic="{ title: 'Hello' }"></my-block>
```

### Lego File (.lego)

```html
<!-- my-block.lego -->
<template>
  <h1>[[ title ]]</h1>
</template>

<style>
  self { padding: 1rem; }
</style>

<script>
export default {
  title: 'Hello'
}
</script>
```
