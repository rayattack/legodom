# 6. Dynamic mounting

The router gets you most of the way, but sometimes you want to swap a block into a target *without* a URL change. Picking a tab. Opening a side panel. Lazy-loading a heavy chart that only some users will see.

That's what `$mount` and `b-mount` are for. And while we're here, you'll learn how to defer block code until it's actually needed, using the `manifest` option.

## `$mount`: imperative

`$mount(tag, target?, props?)` mounts a block. Three forms:

| Form | Effect |
|---|---|
| `this.$mount('chart-card')` | Returns a detached `<chart-card>` for you to insert manually. |
| `this.$mount('chart-card', '#panel')` | Clears `#panel` and mounts a fresh `<chart-card>` inside. |
| `this.$mount('chart-card', '#panel', { id: 42 })` | Same, with `{ id: 42 }` injected as initial state. |

`target` accepts a CSS selector, a single element, or an array of elements. Pass `null` as the tag to clear without remounting.

### A tabbed editor

Add a tab strip to your `app-shell`:

```html
<div class="tabs">
  <button @click="switchTab('summary')">Summary</button>
  <button @click="switchTab('details')">Details</button>
  <button @click="switchTab('history')">History</button>
</div>
<div id="tab-panel"></div>
```

```js
{
  switchTab(name) {
    this.$mount(`${name}-tab`, '#tab-panel');
  }
}
```

Three blocks (`summary-tab.lego`, `details-tab.lego`, `history-tab.lego`) define the panels. Switching tabs unmounts the previous one (running its `unmounted()` hook) and mounts the new one. No router involved, no URL changes, no history pollution. Pure local UI state.

### Passing initial state

Seed the new block with data via the third arg:

```js
openTaskEditor(task) {
  this.$mount('task-editor', '#right-pane', {
    task,
    onSave: (updated) => this.replaceTask(updated)
  });
}
```

Inside `task-editor.lego`, those keys merge into state on mount:

```js
export default {
  task: null,
  onSave: () => {},
  save() {
    this.onSave({ ...this.task, title: this.title });
  }
}
```

The pattern works for callbacks too. Pass a function in, the editor calls it on save, the parent replaces the task. No event bus required.

## `b-mount`: declarative

When the choice of which block to mount is a function of state (not a function of "the user clicked something"), `b-mount` is cleaner.

```html
<div b-mount="`${activeTab}-tab`"></div>
```

```js
{
  activeTab: 'summary'   // changing this swaps the mount
}
```

The expression evaluates to a tag name. The runtime mounts that block as a child of the host element. Change the value, and the previous block unmounts and the new one takes its place.

To clear the host, the *expression* must evaluate to a falsy value (`null`, `undefined`, `""`). Watch out for template literals: `` `${activeTab}-tab` `` with `activeTab = null` produces the string `"null-tab"`, which is truthy. Guard with a short-circuit when you actually want a clear state:

```html
<div b-mount="activeTab && `${activeTab}-tab`"></div>
```

`b-mount` is name-only. It doesn't accept props. When you need to pass initial state, drop into `$mount`.

## Lazy-loading with `manifest`

For larger apps, you don't want to ship every block on first load. The `manifest` option registers tag names that **fetch on first use**:

```js
await Lego.init(document.body, {
  manifest: [{
    base: '/blocks/',
    suffix: true,                       // appends '.lego'
    legos: ['chart-card', 'data-table', 'task-editor']
  }]
});
```

What happens:

1. The runtime registers each tag as a custom element immediately. `<chart-card>` is now a recognized element, but it has no template yet.
2. Until the first `<chart-card>` connects to the DOM, no fetch happens. Your bundle stays small.
3. The first connection triggers `fetch('/blocks/chart-card.lego')`, which is parsed via `Lego.defineLegoFile()` and the live element is snapped.
4. Any other `<chart-card>` instances that connected during the fetch are queued and snapped together when the response lands. Exactly one round-trip per tag.

Same pattern with explicit URL mappings:

```js
manifest: [{
  base: '/widgets/',
  map: {
    'date-picker': 'pickers/date.lego',
    'time-picker': 'pickers/time.lego'
  }
}]
```

…or fetched from a JSON endpoint:

```js
manifest: '/blocks/manifest.json'
```

…with auth:

```js
manifest: {
  url: '/api/blocks/manifest',
  credentials: 'include',
  headers: { Authorization: () => `Bearer ${getToken()}` }
}
```

The header value can be a function (called per-fetch, useful for tokens that rotate) or a static string. Strings prefixed `$db.` resolve through the persistence layer; strings prefixed `$globals.` read from `Lego.globals`.

## Auto-discovery (`config.loader`)

For apps that grow organically, `Lego.config.loader` lets you handle **any** unknown hyphenated tag without listing them up front:

```js
Lego.config.loaderAllowlist = /^app-/;
await Lego.init(document.body, {
  loader: (tag) => `/blocks/${tag}.lego`
});
```

A `MutationObserver` watches the root for unknown hyphenated tags. When one appears, the loader is called; if it returns a URL or a Promise of a `.lego` string, the block is registered and the live element snaps in place.

**The allowlist is mandatory in production.** Without it, attacker-controlled markup (anything reaching `b-html` from user input, for instance) can trigger fetches to your origin for any tag name they like. The runtime will warn you the first time the loader runs without an allowlist; treat that warning as a bug to fix before shipping.

## When to use which

| You need… | Tool |
|---|---|
| The URL to reflect the current view | Routing (`Lego.route` + `b-target`) |
| To swap a panel based on local state | `$mount` (imperative) or `b-mount` (declarative) |
| To split a block list across many files but ship it all at once | Vite plugin (default) |
| To split a block list and load each file on demand | `manifest` |
| To support arbitrary unknown tags from your origin | `config.loader` + allowlist |

The five tools cover essentially every "what shows where" question you'll encounter. Most apps use the first two, sprinkle in the third (default Vite plugin), and reach for manifest or loader only when the bundle gets uncomfortably big.

## Where to go next

Your task tracker is feature-complete. From here:

- The [API reference](/api/) is the source of truth for every method, directive, and helper.
- The [Guide](/guide/) goes deeper on individual concepts (reactivity internals, error boundary cascade, the Vite plugin).
- The [Contributing](/contributing/) track is a tour through the source code itself, useful if you want to extend the framework.

You started this tutorial with no project. You're ending it with a real, persistent, surgically-routed, auth-gated, error-tolerant, lazy-loadable single-page app. You wrote roughly 250 lines of script. No state-management library, no router package, no error-boundary HOC, no localStorage wrapper.

You're done. Ship it.
