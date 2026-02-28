# Tutorial: Build a Task Tracker

In the next 20 minutes, you'll build a complete task tracker with a persistent sidebar, real-time search, data that survives page refreshes, and navigation that feels instant. No prior framework experience needed.

## See What LegoDOM Can Do

Here's a taste. This single `.lego` file gives you a reactive, styled, self-contained component:

```html
<template>
  <h2>[[ title ]]</h2>
  <input b-sync="search" placeholder="Filter tasks...">
  <ul>
    <li b-for="task in filtered" @click="toggle(task)">
      <span b-show="task.done" class="done">✓</span>
      [[ task.name ]]
    </li>
  </ul>
  <p b-if="filtered.length === 0">No tasks found.</p>
</template>

<script>
export default {
  title: 'My Tasks',
  search: '',
  tasks: $db('tasks').default([
    { name: 'Learn LegoDOM', done: false },
    { name: 'Build something great', done: false }
  ]),
  get filtered() {
    return this.tasks.filter(t =>
      t.name.toLowerCase().includes(this.search.toLowerCase())
    );
  },
  toggle(task) {
    task.done = !task.done;
  }
}
</script>
```

That's a searchable, persistent, reactive task list in **30 lines**. No virtual DOM. No state management library. No build step required.

## What You'll Build

A real task tracker dashboard with:

- **Reactive components** — state changes update the DOM automatically
- **Surgical routing** — click a category in the sidebar, only the task list swaps. The sidebar, its scroll position, its state — all untouched
- **Persistent data** — tasks survive page refresh, even across browser tabs
- **Route guards** — protect pages with middleware
- **Scoped styles** — CSS that never leaks between components

## Why LegoDOM?

Most frameworks re-render entire component trees when you navigate. LegoDOM lets you target exactly which part of the page to update. Your sidebar stays. Your scroll position stays. Your in-progress form stays. Only what needs to change, changes.

This is called **surgical routing**, and it changes how you think about building web apps.

## Prerequisites

- Node.js 18+ installed
- A code editor (VS Code recommended)
- Basic HTML, CSS, and JavaScript

## Tutorial Path

| Step | What You'll Build |
|------|-------------------|
| [1. Project Setup](./01-project-setup) | Create a project, run the dev server |
| [2. Your First Block](./02-your-first-block) | A reactive task list with search and filtering |
| [3. Routing & Layouts](./03-adding-routes) | A dashboard shell with surgical navigation |
| [4. Persistence & Forms](./04-multi-page-app) | Data that survives refresh with `$db` |
| [5. State, Guards & Beyond](./05-state-and-globals) | Global state, auth middleware, and polish |

<div style="text-align: center; margin: 2rem 0;">
  <a href="./01-project-setup" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1.2rem;">
    Start Building →
  </a>
</div>

::: tip No Build Tools? No Problem!
If you want to skip the Vite setup and use LegoDOM via CDN, check out the [CDN Quick Start](/guide/cdn-usage). Everything in this tutorial works with plain HTML too.
:::
