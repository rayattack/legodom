# 3. Routing & layouts

Most routers swap the whole page when the URL changes. LegoDOM's router doesn't insist on that. You decide which parts follow the URL and which parts persist. Once you see it work, it's hard to want to go back.

By the end of this chapter you'll have a dashboard with a sidebar that never reloads, even as the content area swaps between three categories.

## The shape we're building

```
┌──────────────────────────────────────────────┐
│                                              │
│  app-shell  (mounts once, never reloads)    │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │ sidebar  │  │ #content                  │ │
│  │          │  │                           │ │
│  │ All      │  │  task-list  / work-tasks  │ │
│  │ Work     │  │  / personal-tasks         │ │
│  │ Personal │  │                           │ │
│  └──────────┘  └──────────────────────────┘ │
└──────────────────────────────────────────────┘
```

The sidebar is part of the shell. The content area is bound to the URL. Three URLs, three blocks, one shell.

## Build the shell

Create `src/app-shell.lego`:

```html
<script>
export default {
  mounted() { console.log('shell mounted'); }
}
</script>

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
```

The crucial element is this:

```html
<lego-router id="content"></lego-router>
```

`<lego-router>` is the default outlet. When a link uses `b-link` (or you call `$go(path).get()` with no targets), the runtime renders the matched route's block into every `<lego-router>` it finds in the document. The `id="content"` is optional, but useful: it lets you also address this same outlet surgically later (`b-target="#content"`) if a different code path needs to.

There's nothing magical about the tag name. It's literally a `querySelectorAll('lego-router')` under the hood. You can have many of them, or none and route every link with `b-target="#selector"` instead. We'll come back to that.

## Two category blocks

`src/work-tasks.lego`:

```html
<script>
export default {
  tasks: [
    { title: 'Finish quarterly report', done: false },
    { title: 'Review PRs',               done: true  },
    { title: 'Update roadmap',           done: false }
  ]
}
</script>

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
```

Copy that file to `src/personal-tasks.lego` with personal tasks (groceries, dentist, whatever). The markup is identical.

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

## Click around

Click between the three sidebar links. Three things happen:

1. The URL changes (`/`, `/work`, `/personal`).
2. The content area swaps to the matched block.
3. **The shell never re-renders.** Open the console and watch `shell mounted` fire exactly once, no matter how many times you click.

That third point is the difference between this and most routing setups you've used. The sidebar's scroll position, any focus state, any in-progress form input: none of it moves. The shell is a single mount that lives for the lifetime of the page. Only the content swaps.

## Programmatic navigation

Inside any block, `this.$go(path, ...targets).get()` does the same thing as a `b-link` click:

```js
{
  goWork() {
    this.$go('/work').get();
  }
}
```

`get(false)` performs the swap **without** updating the URL, useful for tab-like UIs you don't want to bookmark. The verb (`get`, `post`, `put`, `patch`, `delete`) only changes what gets stored in `history.state` for back-button replay; the route table still resolves by path.

## Dynamic routes

URL segments can be captured:

```js
Lego.route('/task/:id', 'task-detail');
```

```js
// task-detail.lego
mounted() {
  const id = this.$route.params.id;
  this.task = this.allTasks.find(t => String(t.id) === id);
}
```

`$route` is reactive. Any block reading `[[ $route.params.id ]]` re-renders automatically when navigation changes the value, so a single `<task-detail>` block can survive across `/task/1` → `/task/2` without unmounting. (It will still re-render the bindings that read the param.)

## Building something complex: the persistent shell

When the app gets bigger you'll typically want one main stage **plus** a few surgical regions that update independently. The architecture maps directly to three different selectors:

```html
<aside id="left">
  <file-tree></file-tree>     <!-- never reloads -->
</aside>

<lego-router id="main"></lego-router>   <!-- default outlet, swaps with the URL -->

<aside id="right"></aside>     <!-- contextual tools, surgical -->
```

```html
<!-- main navigation: uses the default outlet (which is also #main) -->
<a href="/dashboard" b-link>Dashboard</a>
<a href="/files"     b-link>Files</a>

<!-- contextual tools: surgical, no URL change -->
<a href="/tools/inspector" b-target="#right" b-link="false">Inspector</a>

<!-- two outlets at once: a master/detail layout -->
<a href="/orders/42" b-target="#main #right">Order 42</a>
```

Three rules of thumb when you build a real shell:

1. **One `<lego-router>` for the URL-bound stage.** Cold entry needs it (the initial `_matchRoute` call defaults to `lego-router`). If you don't have one, you'd have to seed the cold-entry render yourself from `mounted()`.
2. **`b-target` for anything not URL-driven.** Side panels, tool panes, modals. Pair with `b-link="false"` to keep the URL clean.
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

That's routing. The hard part isn't the API; it's getting your head around "the route doesn't own the page, only the part you point it at". Once that lands, the rest is composition.

[Next: Persistence & forms →](./04-multi-page-app)
