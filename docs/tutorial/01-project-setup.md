# Step 1: Project Setup

Let's get a LegoDOM project running. By the end of this page, you'll have a dev server with hot reload ready to go.

## Create the Project

```bash
npm create legodom@latest my-tracker

cd my-tracker
npm install
npm run dev
```

Open `http://localhost:5173`. You should see a sample LegoDOM welcome page with a working counter.

That counter is a **block** — LegoDOM's term for a component. It's a `.lego` file with HTML, CSS, and JavaScript in one place. We'll build our own in the next step.

## What You Got

Your project has this structure:

```
my-tracker/
├── index.html            ← Entry HTML (minimal)
├── vite.config.js        ← Vite + LegoDOM plugin
├── src/
│   ├── main.js           ← Routes, globals, init
│   └── blocks/           ← Your .lego components
│       └── my-app.lego   ← Sample block
```

### The Entry Point: `src/main.js`

This is where your app comes together — block registration, routes, and initialization:

```javascript
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

// Auto-register every .lego file in src/blocks/
registerBlocks();

// Routes go here (we'll add these in step 3)
// Lego.route('/', 'home-page');

// Start the engine
await Lego.init();
```

::: tip The Golden Rule
Everything app-wide goes in `main.js`: route definitions, global state setup, initialization. Your `.lego` files handle individual components.
:::

### The HTML: `index.html`

Minimal — just loads your script:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Tracker</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

## What's Happening Under the Hood

When `Lego.init()` runs, it:

1. Scans the DOM for any registered block tags
2. Starts the reactivity engine (ES6 Proxies, no virtual DOM)
3. Sets up the router to listen for URL changes
4. Watches for new blocks added to the DOM and auto-mounts them

You don't need to think about any of this. Just write `.lego` files, register routes, and call `init()`.

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Overview
  </a>
  <a href="./02-your-first-block" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Your First Block →
  </a>
</div>
