# Step 1: Project Setup

Let's create a new LegoDOM project from scratch. By the end of this page, you'll have a fully configured development environment ready to build components.

## Create a New Project

Open your terminal and run:

```bash
# Create a new Vite project
npm create vite@latest my-lego-app -- --template vanilla

# Enter the project
cd my-lego-app

# Install LegoDOM
npm install lego-dom

# Install dependencies
npm install
```

## Configure Vite

Create or replace `vite.config.js` in your project root:

```javascript
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [
    legoPlugin({
      componentsDir: './src/components',  // Where your .lego files live
      include: ['**/*.lego']              // File pattern to match
    })
  ]
});
```

## Project Structure

Create this folder structure:

```
my-lego-app/
├── index.html          ← Your app's entry HTML
├── src/
│   ├── app.js          ← Your app's entry JavaScript ⭐
│   └── components/     ← Your .lego files go here
│       └── (empty for now)
├── vite.config.js      ← Vite configuration
└── package.json
```

::: warning The Magic File: `app.js`
This is where **everything comes together**. Your routes, global state, and initialization all happen here. We'll build it in the next section.
:::

## Set Up Your Entry Point

Replace the contents of `src/app.js` (create it if it doesn't exist):

```javascript
// 1. Import the Lego core
import { Lego } from 'lego-dom';

// 2. Import the virtual module that auto-discovers .lego files
import registerComponents from 'virtual:lego-components';

// 3. Register all discovered components
registerComponents();

// 4. Define your routes (we'll add these soon!)
// Lego.route('/', 'home-page');
// Lego.route('/login', 'login-page');

// 5. Initialize the engine
await Lego.init();
```

> **What's happening here?**
> - Lines 1-3: Import LegoDOM and auto-register every `.lego` file in your `components/` folder
> - Line 4: Routes map URLs to components (commented out until we create them)
> - Line 5: `Lego.init()` starts the reactivity engine, routing, and DOM observation

## Set Up Your HTML

Replace `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Lego App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
    }
  </style>
</head>
<body>
  <!-- The router renders your page components here -->
  <lego-router></lego-router>
  
  <!-- Load your app -->
  <script type="module" src="/src/app.js"></script>
</body>
</html>
```

## Run It

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. You'll see a blank page—that's expected! We haven't created any components yet.

## What You've Done

✅ Created a Vite project  
✅ Installed LegoDOM  
✅ Configured the Vite plugin  
✅ Set up `app.js` with the Lego initialization pattern  
✅ Added `<lego-router>` to your HTML  

## The Key Insight

::: tip Where Config Goes: The Golden Rule
**Everything related to your app's setup goes in `app.js`:**
- Component registration → `registerComponents()`
- Route definitions → `Lego.route(...)`
- Global state → `Lego.globals.user = ...`
- Initialization → `Lego.init()`

Your `index.html` just needs `<lego-router>` and a script tag. That's it.
:::

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <span></span>
  <a href="./02-your-first-component" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Your First Component →
  </a>
</div>
