# 4. Persistence & forms

Right now your tasks vanish on refresh. Let's fix that with `$db` — LegoDOM's reactive persistence layer. Tasks will survive refresh, sync across browser tabs, and require zero glue code.

## What `$db` is

`$db('key')` returns a **descriptor**. When you assign it to a state property, the runtime:

1. Hydrates the property from `localStorage[key]` on mount (with the default if nothing is stored).
2. Wraps writes in a debounced `localStorage.setItem`.
3. Subscribes to the `storage` event so changes from other tabs propagate live.

It's the only persistence API. There's no separate "store", no `useState`, no `useReducer` to learn.

## Persist the task list

Open `src/task-list.lego` and change the `tasks` line:

```js
// before
tasks: [
  { title: 'Learn the .lego format',  done: true  },
  { title: 'Build a reactive list',   done: false },
  { title: 'Wire up routing',         done: false }
],

// after
tasks: $db('tasks.all').default([
  { title: 'Learn the .lego format',  done: true  },
  { title: 'Build a reactive list',   done: false },
  { title: 'Wire up routing',         done: false }
]),
```

That's it. No imports, no init code — `$db` is exposed in `.lego` script scope automatically.

Refresh the page, add a task, refresh again. Your task is still there. Open the same URL in a second tab — it shows the same list. Check a box in one tab and watch the other tab update.

## How the magic happens

When the proxy assigns the descriptor:

1. The runtime spots the `__type: 'lego-db'` marker.
2. It reads `localStorage['tasks.all']`. If present, it parses the JSON; if absent, it uses the default.
3. It registers the property under the key `'tasks.all'` in a binding map.
4. From then on, any mutation on the property flows through the proxy's `set` trap, which calls `scheduleSave`, which writes back to `localStorage` (debounced if you set `.debounce(ms)`).
5. A single `storage` event listener fans incoming cross-tab updates back into every binding.

A re-entrancy flag prevents the obvious feedback loop: incoming cross-tab values would otherwise trigger another write, which would fire another storage event in the originating tab.

## Debounce noisy writes

For high-frequency state like a draft, debounce so you're not pinging `localStorage` on every keystroke:

```js
draft: $db('tasks.draft').default('').debounce(300),
```

The first write schedules a save in 300 ms. Further writes within that window reset the timer. The user pauses → the save fires.

## Form patterns you actually need

While we're here, two patterns the tutorial code already touched but didn't name:

### `b-sync` modifiers

```html
<input b-sync.trim="draft">                  <!-- strip whitespace on write -->
<input b-sync.lazy="search">                 <!-- update on `change` instead of `input` -->
<input type="number" b-sync.number="age">    <!-- coerce to Number on write -->
<input b-sync.lazy.number="quantity">        <!-- modifiers stack -->
```

### Submit handling

A `<form b-action>` automatically calls `event.preventDefault()` for you. So this is the canonical submit pattern:

```html
<form b-action @submit="add()">
  <input b-sync.trim="draft">
  <button>Add</button>
</form>
```

### Live search

Add a search box to the top of `task-list.lego`:

```html
<input b-sync.trim="filter" placeholder="Filter…">
```

```js
filter: $db('tasks.filter').default(''),

get visibleTasks() {
  return this.tasks.filter(t =>
    t.title.toLowerCase().includes(this.filter.toLowerCase())
  );
}
```

…and replace the `b-for="task in tasks"` with `b-for="task in visibleTasks"`.

The filter persists across refresh because it's a `$db` value. Nothing else changes — `visibleTasks` is a getter, the runtime reads `this.tasks` and `this.filter` while it executes, and dependency tracking re-runs only that binding when either one updates.

## Quota and eviction

`localStorage` has a hard quota (typically ~5 MB). When a write exceeds it:

1. The runtime catches the `QuotaExceededError`.
2. Evicts the oldest tracked keys (FIFO) to free 2× the space the new value needs.
3. Retries the write.

If eviction can't free enough room, `Lego.config.onError` is invoked with `type: 'quota-critical'` and the value is dropped. Tracking is bounded to keys this app wrote — third-party `localStorage` usage isn't touched.

## Direct `$db` from JS

Anywhere you have access to `Lego` (or via `this.$db` inside a block), you can read/write directly:

```js
const tasks = Lego.db('tasks.all').get();   // synchronous read
Lego.db('tasks.all').set(tasks);            // immediate write
Lego.db('tasks.all').delete();              // remove + notify bindings
```

[Next: State & guards →](./05-state-and-globals)
