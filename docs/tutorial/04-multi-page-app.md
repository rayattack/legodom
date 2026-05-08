# 4. Persistence & forms

Right now your tasks vanish on refresh. That's about to be a one-line fix.

LegoDOM's persistence layer is called `$db`. It treats `localStorage` as first-class reactive state. Declare a `$db` descriptor on a state property, and the runtime hydrates from disk on mount, writes back on every mutation, and broadcasts changes to other tabs. No imports. No glue. No setup.

## Persist the task list

Open `src/task-list.lego` and change one line:

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

Save. Refresh the page, add a task, refresh again. Your task is still there.

Now open the same URL in a second tab. Same list. Check a box in one tab and watch the other tab update in real time, with no code from you.

That's `$db`. The descriptor knows it's persisted; the proxy hydrates from `localStorage` on mount; mutations flow through the proxy's set trap and write back; cross-tab updates ride the browser's `storage` event. You did one line of work and got durability and synchronization.

## What just happened

When the proxy assigns the descriptor:

1. It reads `localStorage['tasks.all']`. If present, parses the JSON; if absent, uses the default.
2. Replaces the descriptor with the resolved value, so the property behaves like any other reactive property from then on.
3. Records the binding so future writes flow through `scheduleSave` (with optional debounce).
4. Subscribes to a single shared `storage` listener for cross-tab sync.

A re-entrancy guard prevents the obvious feedback loop: incoming cross-tab values would otherwise trigger a write, which would fire another storage event in the originating tab, which would trigger another update, and so on.

## Debouncing noisy writes

For state that mutates rapidly (a draft, a search input, a slider), debounce so you're not pinging `localStorage` on every keystroke:

```js
draft: $db('tasks.draft').default('').debounce(300),
```

The first write schedules a save in 300 ms. Subsequent writes within the window push the deadline back. The user pauses, the save fires.

## Form patterns worth naming

You've already used `b-sync`. A few modifiers and conventions are worth pinning down before you start collecting them ad hoc.

### `b-sync` modifiers

```html
<input b-sync.trim="draft">                  <!-- strip whitespace on write -->
<input b-sync.lazy="search">                 <!-- update on `change` instead of `input` -->
<input type="number" b-sync.number="age">    <!-- coerce to Number on write -->
<input b-sync.lazy.number="quantity">        <!-- modifiers stack -->
```

`.lazy` is the one you'll reach for most. Search inputs that hit the network on every keystroke are worse than search inputs that wait for the user to pause.

### Submit handling

A `<form b-action>` automatically calls `event.preventDefault()` for you. So this is the canonical submit pattern:

```html
<form b-action @submit="add()">
  <input b-sync.trim="draft">
  <button>Add</button>
</form>
```

You can also do `<form @submit.prevent="add()">` (which is what the original task list used). Pick whichever reads better at the call site; both work.

## Live search

Let's actually build something with these. Add a search box to `task-list.lego`:

```html
<input b-sync.trim="filter" placeholder="Filter…">
```

Then in the script:

```js
filter: $db('tasks.filter').default(''),

get visibleTasks() {
  return this.tasks.filter(t =>
    t.title.toLowerCase().includes(this.filter.toLowerCase())
  );
}
```

…and replace the `b-for="task in tasks"` with `b-for="task in visibleTasks"`.

Type in the search box. The list filters as you type. Refresh the page. Your search query is still there. Open another tab. Same query, same filtered list.

This is the part that should feel weird if you're coming from a framework where filtered lists, persistent state, and cross-tab sync are three separate libraries. Here it's three properties: a filter, a `$db` descriptor, and a getter. The runtime did the rest.

## Quota and eviction

`localStorage` has a hard quota (browsers cap it around 5 MB). When a write exceeds it:

1. The runtime catches the `QuotaExceededError`.
2. Evicts the oldest tracked keys (FIFO) to free 2× the space the new value needs.
3. Retries the write.

If eviction can't free enough room, `Lego.config.onError` is invoked with `type: 'quota-critical'` and the value is dropped. Eviction only touches keys this app wrote; third-party `localStorage` usage is left alone.

## Direct `$db` from JS

Anywhere you have access to `Lego` (or via `$db` inside a block), you can read and write directly:

```js
const tasks = Lego.db('tasks.all').get();   // synchronous read
Lego.db('tasks.all').set(tasks);            // immediate write
Lego.db('tasks.all').delete();              // remove + notify bindings
```

You'll use these in the next chapter when we add login state.

[Next: State & guards →](./05-state-and-globals)
