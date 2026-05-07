# 3. Routing & layouts

The point of LegoDOM's router isn't to "match URLs". It's to swap **only the parts of the page that need to change** — leaving the shell, sidebar, scroll position, and any in-progress form alone.

By the end of this chapter you'll have a dashboard layout where the sidebar never reloads, even as the content swaps between three categories.

## The shape we're building

```
┌──────────────────────────────────────────────┐
│                                              │
│  app-shell  (mounts once — never reloads)   │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │ sidebar  │  │ #content                  │ │
│  │          │  │                           │ │
│  │ All      │  │  task-list  / work-tasks  │ │
│  │ Work     │  │  / personal-tasks         │ │
│  │ Personal │  │                           │ │
│  └──────────┘  └──────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## Build the shell

Create `src/app-shell.lego`:

```html
<template>
  <aside class="sidebar">
    <h2>Tracker</h2>
    <nav>
      <a href="/"         b-link>All</a>
      <a href="/work"     b-link>Work</a>
      <a href="/personal" b-link>Personal</a>
    </nav>
  </aside>

  <lego-router id="content"></lego-router>
</template>

<style>
  self { display: flex; height: 100vh; font-family: system-ui, sans-serif; }
  .sidebar {
    width: 220px; background: #1a1a2e; color: white; padding: 1.5rem;
    display: flex; flex-direction: column;
  }
  .sidebar h2 { font-size: 1.25rem; margin: 0 0 2rem; color: #667eea; }
  nav { display: flex; flex-direction: column; gap: .25rem; }
  nav a {
    color: rgba(255,255,255,.7); text-decoration: none;
    padding: .6rem .75rem; border-radius: 6px;
  }
  nav a:hover { background: rgba(255,255,255,.1); color: #fff; }
  main { flex: 1; padding: 2rem; overflow-y: auto; background: #f8f9fa; }
</style>

<script>
export default {
  mounted() { console.log('shell mounted'); }
}
</script>
```

The crucial element:

```html
<lego-router id="content"></lego-router>
```

`<lego-router>` is the default outlet — when a link uses `b-link` (or you call `$go(path).get()` with no targets), the runtime renders the matched route's block into every `<lego-router>` it finds. The `id="content"` is optional but useful: it lets you also address this same outlet surgically (`b-target="#content"`) if you ever need to.

You can have many `<lego-router>` elements; they all get swapped on default navigation. Or you can have none and route every link with explicit `b-target="#selector"` — but you'd then need to seed the cold-entry render yourself, since the initial route match defaults to `lego-router`.

## Two category blocks

`src/work-tasks.lego`:

```html
<template>
  <h1>Work</h1>
  <ul>
    <li b-for="t in tasks">
      <label>
        <input type="checkbox" b-sync="t.done">
        <span class="[[ t.done ? 'done' : '' ]]">[[ t.title ]]</span>
      </label>
    </li>
  </ul>
</template>

<style>
  h1 { color: #333; margin: 0 0 1.5rem; }
  ul { list-style: none; padding: 0; }
  li { padding: .75rem 0; border-bottom: 1px solid #eee; }
  label { display: flex; gap: .75rem; align-items: center; cursor: pointer; }
  .done { text-decoration: line-through; opacity: .5; }
</style>

<script>
export default {
  tasks: [
    { title: 'Finish quarterly report', done: false },
    { title: 'Review PRs',               done: true  },
    { title: 'Update roadmap',           done: false }
  ]
}
</script>
```

Copy that file to `src/personal-tasks.lego` with personal tasks (groceries, dentist, whatever — the markup is identical).

## Wire up the routes

Update `src/app.js`:

```js
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';
import './style.css';

registerBlocks();

Lego.route('/',         'task-list');
Lego.route('/work',     'work-tasks');
Lego.route('/personal', 'personal-tasks');

Lego.init();
```

Update `index.html`:

```html
<body>
  <app-shell></app-shell>
  <script type="module" src="/src/app.js"></script>
</body>
```

A note on the architecture: there's nothing magical about `<lego-router>` — it's literally `document.querySelectorAll('lego-router')` under the hood. Three things are true at once:

- A `<lego-router>` element is the **default outlet** — unaddressed navigation lands there.
- An `id` on it is optional, but lets surgical navigation (`b-target="#content"`) target the same element.
- Cold entry — visiting `/work` directly — is a default navigation. So you need *either* a `<lego-router>` for cold entry to render into, *or* logic in your shell's `mounted()` to call `$go(this.$route.url, '#somewhere').get(false)`.

## Try it

`npm run dev` and click between the three sidebar links. Watch:

1. The URL changes (`/`, `/work`, `/personal`).
2. The content area swaps to the matched block.
3. The shell never re-renders. Add `console.log('shell mounted')` to `app-shell`'s `mounted()` — it fires exactly once.

That third point is the difference between this and every framework you've used before. Click around as much as you want — the shell, the scroll position, the focus state on the sidebar — none of it moves.

## Programmatic navigation

Inside any block, `this.$go(path, ...targets).get()` performs the same kind of navigation:

```js
{
  goWork() {
    this.$go('/work', '#content').get();
  }
}
```

`get(false)` performs the swap **without** updating the URL — useful for tab-like UIs that you don't want to bookmark.

## Dynamic routes

Capture URL segments with `:name`:

```js
Lego.route('/task/:id', 'task-detail');
```

```js
// task-detail.lego
mounted() {
  const id = this.$route.params.id;   // string
  this.task = this.allTasks.find(t => String(t.id) === id);
}
```

`$route` is reactive — any block reading `$route.params.id` re-renders automatically when navigation changes the value.

## Building something complex: the persistent shell pattern

When the app gets bigger you'll typically want one main stage **plus** a few surgical regions that update independently. The architecture maps directly to three different selectors:

```html
<!-- app-shell.lego -->
<aside id="left">
  <file-tree></file-tree>     <!-- never reloads -->
</aside>

<lego-router id="main"></lego-router>   <!-- default outlet, swaps with the URL -->

<aside id="right"></aside>     <!-- contextual tools, surgical -->
```

Then:

```html
<!-- main navigation: uses the default outlet (which is also #main) -->
<a href="/dashboard" b-link>Dashboard</a>
<a href="/files"     b-link>Files</a>

<!-- contextual tools: surgical, no URL change -->
<a href="/tools/inspector" b-target="#right" b-link="false">Inspector</a>

<!-- two outlets at once: useful for master/detail layouts -->
<a href="/orders/42" b-target="#main #right">Order 42</a>
```

```js
// In a method, the same options:
this.$go('/dashboard').get();                      // default → #main (lego-router)
this.$go('/tools/inspector', '#right').get(false); // surgical, silent
this.$go('/orders/42', '#main', '#right').get();   // multiple targets
```

Three rules of thumb:

1. **One `<lego-router>` for the URL-bound stage.** Cold entry needs it (the initial `_matchRoute` call defaults to `lego-router`). If you don't have one, you must seed the cold-entry render from `mounted()`.
2. **`b-target` for anything not URL-driven.** Side panels, tool panes, modals. Pair with `b-link="false"` so the URL stays clean.
3. **Don't make routes conditional on selectors.** `Lego.route('/x', 'foo-page')` registers a path → block mapping. The selector lives on the link or the `$go()` call. The same route can render into different outlets from different callsites.

## Quick reference

| I want… | Code |
|---|---|
| Default link (renders into all `<lego-router>` elements) | `<a href="/x" b-link>` |
| Link that swaps a specific region | `<a href="/x" b-target="#id">` |
| Link that updates the URL but renders elsewhere | `<a href="/x" b-target="#id" b-link>` |
| Link that swaps a region without changing the URL | `<a href="/x" b-target="#id" b-link="false">` |
| Multiple targets at once | `<a href="/x" b-target="#a #b">` |
| Programmatic equivalent | `this.$go('/x', '#a', '#b').get(/* push? */)` |
| Read URL params / query | `this.$route.params.id`, `this.$route.query.tab` |

[Next: Persistence & forms →](./04-multi-page-app)
