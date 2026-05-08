# 2. Your first block

Let's build something real. By the end of this chapter you'll have a task list with adding, deleting, completing, a live counter for what's left, and an empty state. About 20 lines of script.

The only thing you'll have to remember is what a `.lego` file is.

## The `.lego` format

Every block lives in a single file, with up to three sections:

```html
<script>
export default {
  // state and methods
}
</script>

<template>
  <!-- HTML with reactive bindings -->
</template>

<style>
  /* scoped CSS, never leaks out, never let in */
</style>
```

The filename becomes the tag (`task-list.lego` → `<task-list>`).

The parser finds each section by tag name, so technically the order of `<script>`, `<template>`, `<style>` is up to you. Stick to the order above as a convention: `<template>` is the only section every block has, so it goes in the middle as a stable anchor; `<script>` and `<style>` are both optional and live at the edges. Reading top-to-bottom, you see the data and methods first, then the markup that uses them, then the styles that decorate it. It's also the convention Svelte uses, for the same reasons.

## Build the task list

Delete `src/my-app.lego`, then create `src/task-list.lego`:

```html
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

  <p b-if="tasks.length === 0" class="empty">No tasks yet. Add one above.</p>

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
```

Update `index.html` to use the new tag:

```html
<body>
  <task-list></task-list>
  <script type="module" src="/src/app.js"></script>
</body>
```

Save. Add a task. Check it off. Delete it. Watch the counter at the bottom update with each change.

## Notice what you didn't have to do

You never called `setState`. You never imported a hook. You never told the framework "this property is reactive". You wrote what reads like a plain JavaScript object, and the runtime took care of everything else. That's the whole reactivity model in LegoDOM, and you just used it without thinking about it.

A few specific moments worth pointing out, in case you missed them:

**`b-sync.trim="draft"`**: the input's value and the `draft` property are now the same value. Type, and `[[ remaining ]]` updates. The `.trim` modifier strips whitespace on the way in.

**`b-for="task in tasks"`**: the `<li>` becomes a template. Push to the array and a new `<li>` appears; splice and one disappears. No keys to worry about, because each task object picks up an auto-generated identity from the runtime, which is fine for inline data like this.

**`get remaining()`**: a getter on the logic object becomes a reactive computed value. It reads `this.tasks` to count, and the runtime tracks that read. Mutating any task re-runs only this binding.

**`<form @submit.prevent="add()">`**: the `.prevent` modifier calls `event.preventDefault()` for you. No imperative event handler needed.

**`b-if="tasks.length === 0"`**: actually mounts and unmounts the empty state. `b-show` next to it toggles `display` instead. Both work; the difference matters when the toggle is frequent (use `b-show`) or when the contents are heavy and you want a fresh start each time (use `b-if`).

**`self { ... }`** in the style block: `self` is rewritten to `:host` at mount time, which targets the block's root element. Every other selector in this `<style>` is scoped to this block's Shadow DOM. You can name a CSS class `.delete` here without worrying about colliding with another block's `.delete`. They live in different worlds.

## Try it

Three small experiments before moving on:

1. Add a "Clear completed" button that removes done tasks. (`this.tasks = this.tasks.filter(t => !t.done)` works, or `this.tasks.splice(0)` and re-push, or anything in between.)
2. Replace the `<form>` wrapper with `@keydown.enter="add()"` directly on the input.
3. Show the "Clear completed" button only when at least one task is done. (`b-show="tasks.some(t => t.done)"`).

Each one only uses what you've already seen. If they all feel obvious, you're ready for the next chapter, where the persistent-shell pattern starts to do something the framework you're coming from probably can't.

[Next: Routing & layouts →](./03-adding-routes)
