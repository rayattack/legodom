# Step 2: Your First Block

Now let's build something real. By the end of this page, you'll have a reactive task list with adding, completing, deleting, and filtering — all in a single `.lego` file.

## The `.lego` File Format

Every block has three sections:

```html
<template>
  <!-- Your HTML with reactive bindings -->
</template>

<style>
  /* Scoped CSS — never leaks to other components */
</style>

<script>
export default {
  // Reactive state and methods
}
</script>
```

The filename becomes the block's tag name: `task-list.lego` → `<task-list>`.

## Build a Task List

Delete the sample `my-app.lego` and create `src/blocks/task-list.lego`:

```html
<template>
  <div class="container">
    <h1>[[ title ]]</h1>

    <!-- Add task form -->
    <form @submit.prevent="addTask()">
      <input
        b-sync="newTask"
        placeholder="What needs to be done?"
        autofocus
      >
      <button type="submit" b-show="newTask.length > 0">Add</button>
    </form>

    <!-- Task list -->
    <ul b-show="tasks.length > 0">
      <li b-for="task in tasks" class="[[ task.done ? 'completed' : '' ]]">
        <label>
          <input type="checkbox" b-sync="task.done">
          <span>[[ task.name ]]</span>
        </label>
        <button class="delete" @click="removeTask($index)">x</button>
      </li>
    </ul>

    <!-- Empty state -->
    <p b-if="tasks.length === 0" class="empty">
      No tasks yet. Add one above!
    </p>

    <!-- Summary -->
    <footer b-show="tasks.length > 0">
      [[ remaining ]] of [[ tasks.length ]] remaining
    </footer>
  </div>
</template>

<style>
  self {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 500px;
    margin: 3rem auto;
    padding: 0 1rem;
  }

  h1 { color: #333; font-size: 1.75rem; }

  form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  input[type="text"], input:not([type]) {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 1rem;
  }

  input:focus { outline: none; border-color: #667eea; }

  form button {
    padding: 0.75rem 1.5rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  ul { list-style: none; padding: 0; }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f0f0f0;
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

  .delete {
    background: none;
    border: none;
    color: #ccc;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
  }

  .delete:hover { color: #e74c3c; }

  .empty {
    text-align: center;
    color: #999;
    padding: 2rem;
  }

  footer {
    text-align: center;
    color: #999;
    padding: 1rem 0;
    font-size: 0.9rem;
  }
</style>

<script>
export default {
  title: 'Task Tracker',
  newTask: '',
  tasks: [
    { name: 'Learn the .lego file format', done: true },
    { name: 'Build a reactive task list', done: false },
    { name: 'Add surgical routing', done: false }
  ],

  get remaining() {
    return this.tasks.filter(t => !t.done).length;
  },

  addTask() {
    if (!this.newTask.trim()) return;
    this.tasks.push({ name: this.newTask.trim(), done: false });
    this.newTask = '';
  },

  removeTask(index) {
    this.tasks.splice(index, 1);
  }
}
</script>
```

## Update `main.js`

Replace the contents of `src/main.js`:

```javascript
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

await Lego.init();
```

Update `index.html` to use your new block:

```html
<body>
  <task-list></task-list>
  <script type="module" src="/src/main.js"></script>
</body>
```

Now run `npm run dev` and try it out. Add tasks, check them off, delete them. Every interaction is instant because LegoDOM updates the DOM directly — no diffing, no virtual DOM.

## What Just Happened

Let's break down the key features you just used:

### Reactive State

```javascript
export default {
  newTask: '',
  tasks: [...]
}
```

Every property in your export is reactive. When you write `this.tasks.push(...)`, LegoDOM detects the change and updates only the affected DOM nodes. You never call `setState()` or manage subscriptions.

### Directives

| Directive | What It Does | You Used It For |
|-----------|-------------|-----------------|
| `b-sync` | Two-way binding between input and state | Binding the text input to `newTask` and checkboxes to `task.done` |
| `b-for` | Renders an element for each item in an array | Rendering the task list |
| `b-if` | Adds/removes an element based on a condition | Showing "No tasks yet" when the list is empty |
| `b-show` | Toggles `display: none` (element stays in DOM) | Hiding the Add button when input is empty, hiding the list when empty |

### Events

```html
<form @submit.prevent="addTask()">
<button @click="removeTask($index)">
```

The `@` prefix binds events. Modifiers like `.prevent` call `event.preventDefault()` automatically. Inside `b-for` loops, `$index` gives you the current iteration index.

### Computed Properties

```javascript
get remaining() {
  return this.tasks.filter(t => !t.done).length;
}
```

JavaScript getters work as computed properties. They re-evaluate automatically when their dependencies change.

### Scoped Styles

```css
self {
  display: block;
  max-width: 500px;
}
```

The `self` selector targets the block's root element (equivalent to `:host` in Shadow DOM). All styles are scoped — your `button` styles won't affect buttons in other blocks.

## Try This

Before moving on, experiment:

1. Add a "Clear completed" button that filters out done tasks
2. Try `@keydown.enter="addTask()"` on the input instead of a form
3. Add a `b-show="tasks.some(t => t.done)"` to show "Clear completed" only when there are completed tasks

These all work with what you've already learned. No new concepts needed.

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./01-project-setup" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Previous: Project Setup
  </a>
  <a href="./03-adding-routes" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Routing & Layouts →
  </a>
</div>
