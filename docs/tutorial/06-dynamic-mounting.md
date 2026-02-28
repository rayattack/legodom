# Step 6: Dynamic Mounting

Your task tracker has routing, persistence, global state, and guards. But every view swap so far has been tied to the URL — click a link, change the path, match a route. What if you want to swap a component into a panel *without* changing the URL?

That's what `$mount` and `b-mount` are for. They let you drop any registered block into any target — no routes, no URL changes.

## The Problem

Look at your current app. When you click "Work" in the sidebar, it navigates to `/work` and the route system swaps `task-list` into `#content`. That works for page-level navigation.

But what about:
- A **details panel** that shows task info when you click a row — without leaving the page
- A **tab system** that switches between views inside a single component
- A **modal** that loads a different block based on context

These are all "mount this component here" problems. They don't need URLs.

## `$mount` — The Programmatic API

`$mount` takes a block name and a target, and mounts it immediately:

```javascript
// Mount a block into a target
this.$mount('task-detail', '#detail-panel');

// Clear a target
this.$mount(null, '#detail-panel');

// Mount with initial props
this.$mount('task-detail', '#detail-panel', { taskId: 42 });
```

### Add a Detail Panel

Let's add a split-view to your task tracker. Clicking a task shows its details in a side panel.

Create `src/blocks/task-detail.lego`:

```html
<template>
  <div class="detail">
    <h3>[[ taskName ]]</h3>
    <p class="category">[[ category ]]</p>
    <p class="desc">[[ description ]]</p>
    <button @click="$mount(null, $element.parentElement)">Close</button>
  </div>
</template>

<style>
  self {
    display: block;
    padding: 1.5rem;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(10px); }
    to { opacity: 1; transform: translateX(0); }
  }

  h3 { margin: 0 0 0.5rem; color: #333; }
  .category {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    background: #667eea;
    color: white;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .desc { color: #666; line-height: 1.5; margin-top: 1rem; }

  button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }
  button:hover { background: #f5f5f5; }
</style>

<script>
export default {
  taskName: 'Untitled',
  category: '',
  description: 'No details available.'
}
</script>
```

Now update your `task-list.lego` template to include a detail panel and mount into it on click:

```html
<template>
  <div class="split-view">
    <ul class="task-list">
      <li b-for="task in tasks"
          @click="showDetail(task)">
        <span>[[ task.name ]]</span>
        <span class="badge">[[ task.category ]]</span>
      </li>
    </ul>
    <aside id="detail-panel"></aside>
  </div>
</template>

<script>
export default {
  tasks: [],

  mounted() {
    this.tasks = [
      { name: 'Write docs', category: 'work', description: 'Document the $mount API' },
      { name: 'Buy groceries', category: 'personal', description: 'Milk, eggs, bread' },
      { name: 'Code review', category: 'work', description: 'Review PR #42' }
    ];
  },

  showDetail(task) {
    this.$mount('task-detail', '#detail-panel', {
      taskName: task.name,
      category: task.category,
      description: task.description
    });
  }
}
</script>
```

Click a task — the detail block slides in on the right. Click "Close" — it clears. No URL change, no route needed.

## `b-mount` — The Reactive Directive

For cases where the mounted component should change reactively based on state, use the `b-mount` directive:

```html
<div b-mount="currentView"></div>
```

The element bearing `b-mount` is the container. When `currentView` changes, the old component is automatically cleaned up and the new one is mounted in its place.

### Build a Tabbed Dashboard

Let's add a dashboard to your tracker with tabs that swap content without routing.

Create `src/blocks/stats-panel.lego`:

```html
<template>
  <div class="stats">
    <div class="stat-card">
      <span class="number">6</span>
      <span class="label">Total Tasks</span>
    </div>
    <div class="stat-card">
      <span class="number">4</span>
      <span class="label">Work</span>
    </div>
    <div class="stat-card">
      <span class="number">2</span>
      <span class="label">Personal</span>
    </div>
  </div>
</template>

<style>
  .stats { display: flex; gap: 1rem; padding: 1rem 0; }
  .stat-card {
    flex: 1;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 1.5rem;
    border-radius: 12px;
    text-align: center;
  }
  .number { display: block; font-size: 2rem; font-weight: 700; }
  .label { opacity: 0.8; font-size: 0.85rem; }
</style>
```

Create `src/blocks/activity-feed.lego`:

```html
<template>
  <ul class="feed">
    <li>Completed "Write docs" <time>2 min ago</time></li>
    <li>Added "Buy groceries" <time>1 hour ago</time></li>
    <li>Started "Code review" <time>3 hours ago</time></li>
  </ul>
</template>

<style>
  .feed { list-style: none; padding: 0; }
  .feed li {
    padding: 0.75rem 0;
    border-bottom: 1px solid #eee;
    color: #555;
  }
  time { float: right; color: #999; font-size: 0.85rem; }
</style>
```

Now create a tabbed container. Create `src/blocks/dashboard-view.lego`:

```html
<template>
  <div class="dashboard">
    <div class="tabs">
      <button @click="tab = 'stats-panel'"
              class="tab"
              b-show="tab !== 'stats-panel'">Stats</button>
      <button @click="tab = 'stats-panel'"
              class="tab active"
              b-show="tab === 'stats-panel'">Stats</button>

      <button @click="tab = 'activity-feed'"
              class="tab"
              b-show="tab !== 'activity-feed'">Activity</button>
      <button @click="tab = 'activity-feed'"
              class="tab active"
              b-show="tab === 'activity-feed'">Activity</button>
    </div>

    <div class="tab-content" b-mount="tab"></div>
  </div>
</template>

<style>
  .dashboard { padding: 1rem; }
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .tab {
    padding: 0.5rem 1.25rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .tab:hover { background: #f5f5f5; }
  .tab.active {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }
  .tab-content {
    min-height: 200px;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 1rem;
  }
</style>

<script>
export default {
  tab: 'stats-panel'
}
</script>
```

The magic line is:

```html
<div class="tab-content" b-mount="tab"></div>
```

When `tab` is `'stats-panel'`, the stats block is mounted inside that div. Click "Activity" — `tab` changes to `'activity-feed'`, the stats block is cleaned up, and the activity feed mounts in its place. All reactive, no routing.

### Ternary Expressions

`b-mount` accepts any expression, so you can use ternaries:

```html
<div b-mount="isAdmin ? 'admin-panel' : 'user-panel'"></div>
```

Or clear the mount point with a falsy value:

```html
<div b-mount="showPanel ? 'settings-panel' : null"></div>
```

## `$mount` vs `$go` — When to Use Which

| | `$go` | `$mount` |
|---|---|---|
| **Changes URL** | Yes | No |
| **Needs a route** | Yes | No |
| **Updates history** | Yes | No |
| **Use for** | Page navigation | UI composition |
| **Supports targets** | Yes (`b-target`) | Yes (2nd argument) |
| **Supports props** | No | Yes (3rd argument) |

Use `$go` when the user is navigating between pages. Use `$mount` when you're composing UI within a page — tabs, panels, modals, detail views.

They work well together. Your sidebar links still use `b-target` and routing for page-level navigation. Inside those pages, `$mount` and `b-mount` handle the component-level composition.

## What You've Added

| Feature | How |
|---------|-----|
| Programmatic mounting | `this.$mount('block-name', '#target')` |
| Props on mount | `this.$mount('block', '#target', { key: val })` |
| Clear a target | `this.$mount(null, '#target')` |
| Reactive mounting | `<div b-mount="stateVar"></div>` |
| Conditional mounting | `b-mount="flag ? 'comp-a' : 'comp-b'"` |

---

<div style="display: flex; justify-content: space-between; margin-top: 2rem;">
  <a href="/tutorial/05-state-and-globals" style="text-decoration: none; color: #667eea; font-weight: 500;">← 5. State, Guards & Beyond</a>
  <a href="/guide/" style="text-decoration: none; color: #667eea; font-weight: 500;">Explore the Full Guide →</a>
</div>
