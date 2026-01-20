# Step 1: Project Setup

Let's create a new LegoDOM project from scratch. By the end of this page, you'll have a fully configured development environment ready to build blocks.

## Create a New Project

The fastest way to get started is with `create-legodom`:

```bash
# Create a new LegoDOM project
npm create legodom@latest my-lego-app

# Enter the project
cd my-lego-app

# Install dependencies
npm install
```

That's it! Your project is fully configured with:
- ✅ Vite + LegoDOM plugin
- ✅ Proper folder structure  
- ✅ Sample component
- ✅ All dependencies


This is where **everything comes together**. Your routes, global state, and initialization all happen here. We'll build it in the next section.
:::

## Understanding the Setup

::: tip Already Done!
If you used `create-legodom`, the following setup is already complete in your project. You can skip to [running the app](#run-it) or read on to understand what's happening.
:::

### Entry Point: `src/main.js`

This is where **everything comes together**—routes, block registration, and initialization:

```javascript
// 1. Import the Lego core
import { Lego } from 'lego-dom';

// 2. Import the virtual module that auto-discovers .lego files
import registerBlocks from 'virtual:lego-blocks';

// 3. Register all discovered blocks
registerBlocks();

// 4. Define your routes (we'll add these soon!)
// Lego.route('/', 'home-page');
// Lego.route('/login', 'login-page');

// 5. Initialize the engine
Lego.init();
```

**What's happening here?**
- Lines 1-3: Import LegoDOM and auto-register every `.lego` file
- Line 4: Routes map URLs to blocks (we'll add these later)
- Line 5: `Lego.init()` starts the reactivity engine and routing

### HTML File: `index.html`

Your HTML is minimal (already set up by `create-legodom`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LegoDOM App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
  <my-app></my-app>
</body>
</html>
```

## Run It

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. You'll see the sample LegoDOM welcome page with a counter!

::: tip What You're Seeing
The `my-app.lego` component was created by `create-legodom`. It demonstrates:
- Template interpolation with `[[ ]]`
- Event handling with `@click`
- Reactive state updates
:::

## What You've Done

✅ Created a LegoDOM project with `create-legodom`  
✅ Installed all dependencies  
✅ Vite is configured with the LegoDOM plugin  
✅ Saw a working example component  
✅ Dev server is running with HMR  

## The Key Insight

::: tip Where Config Goes: The Golden Rule
**Everything related to your app's setup goes in `src/main.js` (or `src/app.js`):**
- Block registration → `registerBlocks()`
- Route definitions → `Lego.route(...)`
- Global state → `Lego.globals.user = ...`
- Initialization → `Lego.init()`

Your `index.html` is minimal—just load the script and render blocks.
:::

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <span></span>
  <a href="./02-your-first-block" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Your First Block →
  </a>
</div>
