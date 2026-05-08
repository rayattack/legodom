# Tutorial: Build a Task Tracker

Six chapters. By the end you'll have a working task-tracker with reactive blocks, a sidebar that doesn't reload between pages, persistent storage that survives refresh, an admin route guarded by middleware, and a "task editor" panel that loads on demand. About 250 lines of script across the whole app.

If that sounds like a lot, you'll be surprised how little code it takes. The point of this tutorial isn't to make you type a lot. It's to walk you through enough patterns that the next time you sit down with LegoDOM, you already know which tool reaches for which problem.

Every snippet on this track runs against the current LegoDOM source. No skipped steps, no hidden setup. Copy what you see and it will run.

## What you'll build

```
┌─────────────────────────────────────────────┐
│  Tracker         All  Work  Personal  Admin │
├──────────┬──────────────────────────────────┤
│  search  │  ☐  Finish quarterly report     │
│   ↓      │  ☑  Review pull requests        │
│  filter  │  ☐  Update project roadmap      │
│   ↓      │                                  │
│  add     │  3 of 5 remaining               │
└──────────┴──────────────────────────────────┘
```

Specifically:

- A persistent shell. The sidebar and search bar never reload between page changes.
- Routes (`/`, `/work`, `/personal`, `/admin`) that swap only the content area.
- Tasks stored in `localStorage` with cross-tab sync.
- An `/admin` route protected by middleware.
- A task editor that loads on demand the first time you click a task.

## What you should already know

- HTML, CSS, and modern JavaScript (`async`/`await`, getters, the spread operator).
- The shape of a `package.json` and how to run an `npm` script.

You do **not** need prior experience with React, Vue, Svelte, or Web Components. If you have it, a few moments in this tutorial will feel weirdly easy. That's the point.

## Chapters

| # | Page | Topic |
|---|---|---|
| 1 | [Project setup](./01-project-setup) | Scaffold, file layout, dev server |
| 2 | [Your first block](./02-your-first-block) | `.lego` files, reactivity, directives |
| 3 | [Routing & layouts](./03-adding-routes) | `Lego.route`, `b-target`, the persistent shell |
| 4 | [Persistence & forms](./04-multi-page-app) | `$db`, two-way binding, cross-tab sync |
| 5 | [State & guards](./05-state-and-globals) | `Lego.globals`, route middleware, error boundaries |
| 6 | [Dynamic mounting](./06-dynamic-mounting) | `b-mount`, `$mount`, lazy `manifest` |

::: tip Prefer no build step?
Skim [CDN Usage](/guide/cdn-usage) instead. Every concept here applies; you just declare blocks with `<template b-id>` directly in your HTML instead of in `.lego` files.
:::
