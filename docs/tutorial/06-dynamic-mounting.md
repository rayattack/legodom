# 6. Dynamic mounting

The router gets you most of the way, but sometimes you want to swap a block into a target **without** a URL change — picking a tab, opening a side panel, lazy-loading a heavy chart. That's what `$mount` and `b-mount` are for.

By the end of this chapter you'll also see how to defer block code until it's actually needed, using the `manifest` option.

## `$mount` — imperative

`$mount(tag, target?, props?)` mounts a block. Three forms:

| Form | Effect |
|---|---|
| `this.$mount('chart-card')` | Returns a detached `<chart-card>` for you to insert manually. |
| `this.$mount('chart-card', '#panel')` | Clears `#panel` and mounts a fresh `<chart-card>` inside. |
| `this.$mount('chart-card', '#panel', { id: 42 })` | Same, with `{ id: 42 }` injected as initial state. |

`target` accepts a CSS selector, a single element, or an array of elements. Pass `null` as the tag to clear without remounting.

### Practical example: a tabbed editor

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

`summary-tab.lego`, `details-tab.lego`, `history-tab.lego` each define their own block — switching tabs unmounts the previous one (running its `unmounted()` hook) and mounts the new one. No router involved.

### Passing initial state

If you need to seed the new block with data, pass it as the third arg:

```js
openTaskEditor(task) {
  this.$mount('task-editor', '#right-pane', {
    task,
    onSave: (updated) => this.replaceTask(updated)
  });
}
```

Inside `task-editor.lego`, those keys are merged into state on mount:

```js
export default {
  task: null,
  onSave: () => {},
  save() {
    this.onSave({ ...this.task, title: this.title });
  }
}
```

## `b-mount` — declarative

`b-mount="expr"` evaluates an expression to a tag name string and mounts it as a child of the host element. When the expression value changes, the previous mount is unmounted and the new one takes its place.

```html
<div b-mount="`${activeTab}-tab`"></div>
```

```js
{
  activeTab: 'summary'   // changing this swaps the mount
}
```

`null`/`undefined`/empty string clears the mount. To pass props, use `$mount` (declarative `b-mount` does not support props in v2).

## Lazy-loading with `manifest`

For larger apps, you don't want to ship every block on first load. Use the `manifest` option to register tag names that **fetch on first use**:

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

1. The runtime registers each tag as a custom element immediately. `<chart-card>` is now a recognized tag.
2. Until the first `<chart-card>` connects to the DOM, no fetch happens.
3. The first connection triggers `fetch('/blocks/chart-card.lego')`, which is parsed via `Lego.defineLegoFile()` and the live element is snapped.
4. Any other `<chart-card>` instances that connected during the fetch are queued and snapped together when the response lands — exactly one round-trip per tag.

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

## Auto-discovery (`config.loader`)

For apps that grow organically, `Lego.config.loader` lets you handle **any** unknown hyphenated tag:

```js
Lego.config.loaderAllowlist = /^app-/;
await Lego.init(document.body, {
  loader: (tag) => `/blocks/${tag}.lego`
});
```

A `MutationObserver` watches the root for unknown hyphenated tags. When one appears, the loader is called; if it returns a URL or a Promise of a `.lego` string, the block is registered and the live element snaps in place.

The allowlist is mandatory in production — without it, attacker-controlled markup can trigger fetches to your origin.

## When to use which

| You need… | Tool |
|---|---|
| The URL to reflect the current view | Routing (`Lego.route` + `b-target`) |
| To swap a panel based on local state | `$mount` (imperative) or `b-mount` (declarative) |
| To split a block list across many files but ship it all at once | Vite plugin (default) |
| To split a block list and load each file on demand | `manifest` |
| To support arbitrary unknown tags from your origin | `config.loader` + allowlist |

## Where to go next

Your task tracker is feature-complete. From here:

- The [API reference](/api/) is the source-of-truth for every method, directive, and helper.
- The [Guide](/guide/) goes deeper into individual concepts (reactivity internals, error boundary cascade, vite plugin).
- The [Contributing](/contributing/) track is a tour through the source code itself — useful if you want to extend the framework.

You're done. Ship it.
