# Step 3: Routing & Layouts

This is where LegoDOM shows its real power. By the end of this page, you'll have a dashboard with a persistent sidebar and content that swaps surgically — no page reload, no lost state.

## The Problem with Traditional Routing

In most frameworks, navigating between pages re-renders everything. Click a sidebar link and the entire component tree tears down and rebuilds. Your sidebar scroll position resets. Your search input clears. Any in-progress form is gone.

LegoDOM does something different: **surgical routing**. You tell it exactly which part of the page to update. Everything else stays untouched.

## Build a Dashboard Shell

First, let's create the layout that wraps our app. Create `src/blocks/app-shell.lego`:

```html
<template>
  <div class="layout">
    <aside class="sidebar">
      <h2>Tracker</h2>
      <nav>
        <a href="/" b-target="#content">All Tasks</a>
        <a href="/work" b-target="#content">Work</a>
        <a href="/personal" b-target="#content">Personal</a>
      </nav>
      <div class="sidebar-footer">
        <p>[[ taskCount ]] total tasks</p>
      </div>
    </aside>

    <main id="content">
      <!-- This is where routed content appears -->
      <task-list></task-list>
    </main>
  </div>
</template>

<style>
  self {
    display: block;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .layout {
    display: flex;
    height: 100%;
  }

  .sidebar {
    width: 220px;
    background: #1a1a2e;
    color: white;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
  }

  .sidebar h2 {
    font-size: 1.25rem;
    margin-bottom: 2rem;
    color: #667eea;
  }

  nav { display: flex; flex-direction: column; gap: 0.25rem; }

  nav a {
    color: rgba(255,255,255,0.7);
    text-decoration: none;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
    transition: background 0.15s;
  }

  nav a:hover {
    background: rgba(255,255,255,0.1);
    color: white;
  }

  .sidebar-footer {
    margin-top: auto;
    font-size: 0.85rem;
    opacity: 0.5;
  }

  main {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
    background: #f8f9fa;
  }
</style>

<script>
export default {
  taskCount: 0,

  mounted() {
    this.taskCount = 6;
  }
}
</script>
```

Notice the key detail in the sidebar links:

```html
<a href="/work" b-target="#content">Work</a>
```

The `b-target="#content"` attribute tells LegoDOM: _"When this link is clicked, only replace the contents of `#content`. Leave everything else alone."_

This is **surgical routing**. The sidebar, its state, its scroll position — all preserved.

## Create Category Pages

Now let's create the blocks that swap into `#content`. Create `src/blocks/work-tasks.lego`:

```html
<template>
  <div class="page">
    <h1>Work Tasks</h1>
    <ul>
      <li b-for="task in tasks" class="[[ task.done ? 'completed' : '' ]]">
        <label>
          <input type="checkbox" b-sync="task.done">
          <span>[[ task.name ]]</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<style>
  .page h1 { color: #333; margin-bottom: 1.5rem; }

  ul { list-style: none; padding: 0; }

  li {
    display: flex;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #eee;
  }

  li label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
  }

  li.completed span {
    text-decoration: line-through;
    opacity: 0.5;
  }
</style>

<script>
export default {
  tasks: [
    { name: 'Finish quarterly report', done: false },
    { name: 'Review pull requests', done: true },
    { name: 'Update project roadmap', done: false }
  ]
}
</script>
```

Create `src/blocks/personal-tasks.lego`:

```html
<template>
  <div class="page">
    <h1>Personal Tasks</h1>
    <ul>
      <li b-for="task in tasks" class="[[ task.done ? 'completed' : '' ]]">
        <label>
          <input type="checkbox" b-sync="task.done">
          <span>[[ task.name ]]</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<style>
  .page h1 { color: #333; margin-bottom: 1.5rem; }
  ul { list-style: none; padding: 0; }
  li {
    display: flex; align-items: center;
    padding: 0.75rem 0; border-bottom: 1px solid #eee;
  }
  li label { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; }
  li.completed span { text-decoration: line-through; opacity: 0.5; }
</style>

<script>
export default {
  tasks: [
    { name: 'Grocery shopping', done: false },
    { name: 'Call dentist', done: false },
    { name: 'Read new book', done: true }
  ]
}
</script>
```

## Wire Up the Routes

Update `src/main.js`:

```javascript
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

// Map URLs to blocks
Lego.route('/', 'app-shell');
Lego.route('/work', 'app-shell');
Lego.route('/personal', 'app-shell');

await Lego.init();
```

Update `index.html`:

```html
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
```

Notice something: all three routes point to the same `app-shell` block. That's because the shell is the layout — it stays mounted. The `b-target="#content"` on each sidebar link controls what swaps inside it.

## Try It

Run `npm run dev` and click between "All Tasks", "Work", and "Personal" in the sidebar.

Watch what happens:
1. The URL changes (`/`, `/work`, `/personal`)
2. The content area swaps to the correct block
3. **The sidebar doesn't re-render** — add a `console.log` in `app-shell`'s `mounted()` to verify it only fires once

This is the difference between LegoDOM and traditional routers. The shell stays alive. Only fragments swap.

## How Surgical Routing Works

```
┌─────────────────────────────────────────────┐
│  app-shell (stays mounted)                   │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │ sidebar  │  │ #content  ← ONLY THIS    │ │
│  │          │  │            SWAPS          │ │
│  │ All      │  │ ┌────────────────────┐   │ │
│  │ Work     │  │ │  work-tasks        │   │ │
│  │ Personal │  │ │  (or personal, or  │   │ │
│  │          │  │ │   task-list)       │   │ │
│  │          │  │ └────────────────────┘   │ │
│  └──────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────┘
```

Traditional SPA routers would tear down the entire tree and rebuild it. LegoDOM finds `#content`, unmounts whatever is inside it, and mounts the new block. The shell is never touched.

## Programmatic Navigation

You can also navigate from JavaScript:

```javascript
// In any block's methods
goToWork() {
  this.$go('/work', '#content').get();
}
```

The second argument to `$go()` is the target — same as `b-target`. You can pass multiple targets too:

```javascript
// Swap both the content and a notification area
this.$go('/work', '#content', '#notifications').get();
```

## Dynamic Routes

Routes can capture URL parameters:

```javascript
// In main.js
Lego.route('/task/:id', 'app-shell');
```

```html
<!-- In a block template -->
<a href="/task/42" b-target="#content">View Task 42</a>
```

```javascript
// In task-detail.lego
export default {
  mounted() {
    const taskId = this.$route.params.id;  // "42"
    this.loadTask(taskId);
  }
}
```

## Navigation Quick Reference

| I want to... | Syntax |
|--------------|--------|
| Link that swaps a fragment | `<a href="/path" b-target="#id">` |
| Link that replaces the whole page | `<a href="/path" b-link>` |
| Navigate from JavaScript | `this.$go('/path', '#target').get()` |
| Read URL params | `this.$route.params.id` |
| Read query string | `this.$route.query.tab` |

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./02-your-first-block" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Previous: Your First Block
  </a>
  <a href="./04-multi-page-app" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Persistence & Forms →
  </a>
</div>
