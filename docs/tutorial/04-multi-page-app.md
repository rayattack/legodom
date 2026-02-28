# Step 4: Persistence & Forms

Right now, your tasks disappear when you refresh the page. Let's fix that. LegoDOM has a built-in persistence API called `$db` that saves data to the browser and syncs it across tabs — no setup, no database, no backend needed.

## Meet `$db`

`$db` wraps browser storage with reactive bindings. When state changes, it saves automatically. When the page reloads, it restores automatically.

Replace the `<script>` section of `src/blocks/task-list.lego`:

```javascript
<script>
export default {
  title: 'All Tasks',
  newTask: '',
  tasks: $db('all-tasks').default([
    { name: 'Learn the .lego file format', done: true },
    { name: 'Build a reactive task list', done: false },
    { name: 'Add surgical routing', done: false }
  ]).debounce(300),

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

The only line that changed:

```javascript
// Before:
tasks: [...]

// After:
tasks: $db('all-tasks').default([...]).debounce(300)
```

That's it. Your tasks now survive page refresh.

### What `$db` Does

| Method | Purpose |
|--------|---------|
| `$db('key')` | Create a persistent binding with this storage key |
| `.default(value)` | Use this value if nothing is stored yet |
| `.debounce(ms)` | Wait this many milliseconds before saving (prevents rapid writes) |

## Try It

1. Add a few tasks in your app
2. Refresh the page — your tasks are still there
3. Open a second browser tab to the same URL — changes sync between tabs

The cross-tab sync is automatic. `$db` listens for storage events and updates all connected components.

## Add Persistence to Category Pages

Update `src/blocks/work-tasks.lego`'s script:

```javascript
<script>
export default {
  tasks: $db('work-tasks').default([
    { name: 'Finish quarterly report', done: false },
    { name: 'Review pull requests', done: true },
    { name: 'Update project roadmap', done: false }
  ]).debounce(300)
}
</script>
```

And `src/blocks/personal-tasks.lego`:

```javascript
<script>
export default {
  tasks: $db('personal-tasks').default([
    { name: 'Grocery shopping', done: false },
    { name: 'Call dentist', done: false },
    { name: 'Read new book', done: true }
  ]).debounce(300)
}
</script>
```

Each block gets its own storage key. Work tasks and personal tasks persist independently.

## Build an Add Task Form

Let's create a dedicated form block that demonstrates `b-sync` modifiers and form handling. Create `src/blocks/add-task-form.lego`:

```html
<template>
  <div class="form-card">
    <h2>New Task</h2>

    <form @submit.prevent="submit()">
      <div class="field">
        <label>Task name</label>
        <input b-sync="name" placeholder="What needs to be done?" required>
      </div>

      <div class="field">
        <label>Category</label>
        <select b-sync="category">
          <option value="all">All</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
        </select>
      </div>

      <div class="field">
        <label>Priority (1-5)</label>
        <input type="number" b-sync.number="priority" min="1" max="5">
      </div>

      <div class="field">
        <label>Notes</label>
        <textarea b-sync.trim="notes" placeholder="Optional details..."></textarea>
      </div>

      <div class="actions">
        <button type="submit" b-show="name.length > 0">Add Task</button>
        <p b-show="added" class="success">Task added!</p>
      </div>
    </form>
  </div>
</template>

<style>
  self { display: block; }

  .form-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    max-width: 500px;
  }

  h2 { color: #333; margin-bottom: 1.5rem; }

  .field {
    margin-bottom: 1.25rem;
  }

  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: #555;
    margin-bottom: 0.4rem;
  }

  input, select, textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    font-size: 0.95rem;
  }

  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #667eea;
  }

  textarea { min-height: 80px; resize: vertical; }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  button {
    padding: 0.7rem 1.5rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .success {
    color: #27ae60;
    font-weight: 600;
    font-size: 0.9rem;
  }
</style>

<script>
export default {
  name: '',
  category: 'all',
  priority: 3,
  notes: '',
  added: false,

  submit() {
    // Get the right storage key based on category
    const key = this.category === 'all' ? 'all-tasks'
      : this.category + '-tasks';

    // Read current tasks, add the new one, save
    const tasks = $db(key).get() || [];
    tasks.push({
      name: this.name,
      done: false,
      priority: this.priority,
      notes: this.notes
    });
    $db(key).set(tasks);

    // Reset form
    this.name = '';
    this.notes = '';
    this.priority = 3;
    this.added = true;

    setTimeout(() => { this.added = false; }, 2000);
  }
}
</script>
```

### `b-sync` Modifiers

Notice the modifiers on the inputs:

```html
<input type="number" b-sync.number="priority">  <!-- Parses as number -->
<textarea b-sync.trim="notes">                   <!-- Trims whitespace -->
```

| Modifier | Effect |
|----------|--------|
| `.number` | Parses the value as a float |
| `.trim` | Strips leading/trailing whitespace |
| `.lazy` | Updates on `change` instead of `input` (less frequent) |

## Add the Form to Your App

Add a route and a sidebar link. Update `src/main.js`:

```javascript
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

Lego.route('/', 'app-shell');
Lego.route('/work', 'app-shell');
Lego.route('/personal', 'app-shell');
Lego.route('/add', 'app-shell');       // New!

await Lego.init();
```

Add a link in `src/blocks/app-shell.lego`'s sidebar nav:

```html
<nav>
  <a href="/" b-target="#content">All Tasks</a>
  <a href="/work" b-target="#content">Work</a>
  <a href="/personal" b-target="#content">Personal</a>
  <a href="/add" b-target="#content" class="add-link">+ Add Task</a>
</nav>
```

And register the route→block mapping. When `/add` loads inside the shell, we want it to show `add-task-form`. Add a route for that:

```javascript
Lego.route('/add', 'app-shell');
```

Since the shell is already mounted and `b-target` handles fragment swaps, the form will load into `#content` when you click "+ Add Task".

## The `$db` API at a Glance

```javascript
// In state declarations (reactive binding)
tasks: $db('my-key').default([]).debounce(500)

// In methods (direct read/write)
$db('my-key').get()          // Read from storage
$db('my-key').set(value)     // Write to storage
$db('my-key').delete()       // Remove from storage
```

Data is JSON-serialized to `localStorage`. If storage fills up, `$db` automatically evicts the oldest entries to make room.

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./03-adding-routes" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Previous: Routing & Layouts
  </a>
  <a href="./05-state-and-globals" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: State, Guards & Beyond →
  </a>
</div>
