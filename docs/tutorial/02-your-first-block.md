# 2. Your first block

Build a reactive task list with adding, completing, deleting, and a live counter.

## The `.lego` format

Every block is a single file with up to three sections:

```html
<template>
  <!-- HTML with reactive bindings -->
</template>

<style>
  /* scoped CSS — never leaks out, never let in */
</style>

<script>
export default {
  // state and methods
}
</script>
```

The filename becomes the tag name (`task-list.lego` → `<task-list>`). Order doesn't matter — the parser handles them by name.

## Build the task list

Delete `src/my-app.lego`, then create `src/task-list.lego`:

```html
<template>
  <h1>[[ title ]]</h1>

  <form @submit.prevent="add()">
    <input b-sync.trim="draft" placeholder="What needs to be done?" autofocus>
    <button type="submit" b-show="draft.length > 0">Add</button>
  </form>

  <ul b-show="tasks.length > 0">
    <li b-for="task in tasks" class="[[ task.done ? 'done' : '' ]]">
      <label>
        <input type="checkbox" b-sync="task.done">
        <span>[[ task.title ]]</span>
      </label>
      <button class="delete" @click="remove($index)">×</button>
    </li>
  </ul>

  <p b-if="tasks.length === 0" class="empty">No tasks yet — add one above.</p>

  <footer b-show="tasks.length > 0">
    [[ remaining ]] of [[ tasks.length ]] remaining
  </footer>
</template>

<style>
  self {
    display: block;
    max-width: 500px;
    margin: 3rem auto;
    padding: 0 1rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  h1 { color: #333; font-size: 1.75rem; }
  form { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
  input:not([type=checkbox]) {
    flex: 1; padding: .75rem 1rem;
    border: 2px solid #e0e0e0; border-radius: 8px;
    font-size: 1rem;
  }
  input:focus { outline: none; border-color: #667eea; }
  form button {
    padding: .75rem 1.5rem; background: #667eea; color: white;
    border: 0; border-radius: 8px; font-weight: 600; cursor: pointer;
  }
  ul { list-style: none; padding: 0; }
  li {
    display: flex; align-items: center; justify-content: space-between;
    padding: .75rem 0; border-bottom: 1px solid #f0f0f0;
  }
  li label { display: flex; align-items: center; gap: .75rem; cursor: pointer; }
  li.done span { text-decoration: line-through; opacity: .5; }
  .delete {
    background: 0; border: 0; color: #ccc; font-size: 1.2rem; cursor: pointer;
  }
  .delete:hover { color: #e74c3c; }
  .empty, footer { color: #999; text-align: center; padding: 1rem 0; }
</style>

<script>
export default {
  title: 'Tracker',
  draft: '',
  tasks: [
    { title: 'Learn the .lego format',  done: true  },
    { title: 'Build a reactive list',   done: false },
    { title: 'Wire up routing',         done: false }
  ],

  get remaining() {
    return this.tasks.filter(t => !t.done).length;
  },

  add() {
    if (!this.draft) return;
    this.tasks.push({ title: this.draft, done: false });
    this.draft = '';
  },

  remove(i) {
    this.tasks.splice(i, 1);
  }
}
</script>
```

Update `index.html` to use the new tag:

```html
<body>
  <task-list></task-list>
  <script type="module" src="/src/app.js"></script>
</body>
```

Save. Add tasks, check them, delete them. Every interaction is instant — there's no virtual DOM and no diffing pass; the runtime updates exactly the affected nodes.

## What you used

### Reactive state

Everything in `export default` becomes reactive on mount. The `tasks` array is wrapped in a `Proxy`; pushing, splicing, or assigning to a nested `task.done` all flow through the proxy and schedule a render on the next animation frame.

You never call `setState`. Mutate the data and the DOM follows.

### Directives

| Used | Effect |
|---|---|
| `b-sync.trim="draft"` | Two-way bind to the input's value, with whitespace trimmed on write. |
| `b-sync="task.done"` | Two-way bind a checkbox to the loop item. |
| `b-for="task in tasks"` | Render a `<li>` per task. |
| `b-if="tasks.length === 0"` | Mount/unmount the empty state. |
| `b-show="…"` | Toggle inline `display`. The element stays in the DOM. |

### Interpolation

`[[ expr ]]` evaluates JavaScript against the block's state. `[[ task.title ]]`, `[[ remaining ]]`, `[[ task.done ? 'done' : '' ]]` — all just expressions. `$index` is available inside `b-for` for the zero-based position.

### Events

`@submit.prevent="add()"` runs `add()` and calls `event.preventDefault()`. `@click="remove($index)"` passes the loop index. Modifiers stack: `@keydown.enter.ctrl.prevent="save()"` only fires for Ctrl-Enter and prevents the default.

### Computed properties

A getter on the logic object becomes a reactive computed. `remaining` reads `this.tasks` — the runtime tracks that read, so any mutation that touches the array re-runs only the binding that depends on `remaining`.

### Scoped styles

`self` is rewritten to `:host` at mount time. All other selectors are scoped to this block's Shadow DOM — your `button` styling can't reach into other components. The block is self-contained.

## Try it

Three small experiments before moving on:

1. Add a "Clear completed" button that filters out done tasks.
2. Use `@keydown.enter="add()"` on the input instead of wrapping it in a `<form>`.
3. Show the "Clear completed" button only when at least one task is done — `b-show="tasks.some(t => t.done)"`.

Each one only uses what's already on this page.

[Next: Routing & layouts →](./03-adding-routes)
