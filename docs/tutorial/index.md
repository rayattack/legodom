# Tutorial: Build a Task Tracker

Six chapters. By the end, you'll have a single-page task tracker with reactive blocks, surgical routing, persistent storage that survives refresh, an auth-guarded admin route, and lazy-loaded blocks.

Every snippet on this track runs against the current LegoDOM source. There are no skipped steps and no hidden setup — copy what you see and it will run.

## What you'll build

A real task-tracker app:

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

- A persistent shell — the sidebar and search bar never reload between page changes.
- Routes (`/`, `/work`, `/personal`, `/admin`) that swap only the content area.
- Tasks stored in `localStorage` with cross-tab sync.
- An `/admin` route protected by middleware.
- A "task editor" block that loads on demand the first time you click a task.

## What you should already know

- HTML, CSS, and modern JavaScript (`async`/`await`, getters, the spread operator).
- The shape of a `package.json` and how to run an `npm` script.

You do **not** need prior experience with React, Vue, Svelte, or Web Components.

## Chapters

| # | Page | Topic |
|---|---|---|
| 1 | [Project setup](./01-project-setup) | Scaffold, file layout, dev server |
| 2 | [Your first block](./02-your-first-block) | `.lego` files, reactivity, directives |
| 3 | [Routing & layouts](./03-adding-routes) | `Lego.route`, `b-target`, the persistent shell |
| 4 | [Persistence & forms](./04-multi-page-app) | `$db`, two-way binding, cross-tab sync |
| 5 | [State & guards](./05-state-and-globals) | `Lego.globals`, route middleware |
| 6 | [Dynamic mounting](./06-dynamic-mounting) | `b-mount`, `$mount`, lazy `manifest` |

::: tip CDN-only path
Prefer to work without a build step? Skim [CDN Usage](/guide/cdn-usage) — every concept here applies, you just declare blocks with `<template b-id>` instead of `.lego` files.
:::
