# Reactivity

Most of the time you'll write LegoDOM and not think about reactivity at all. You assign a value, the screen updates. You push to an array, the list grows. That's the deal: write JavaScript, the DOM follows.

This page is for the moments when you wonder *how*, or you want to know what's expensive versus cheap, or you hit something that doesn't update the way you expected. The model is small. Most of it can be explained in two sentences.

## The deal

Every block's state is wrapped in a `Proxy` at mount time. Reads are tracked. Writes schedule re-renders. That's it.

Inside a block, `this` is the proxy. So:

```js
{
  count: 0,
  inc() { this.count++; }   // schedules a re-render
}
```

There's no `setState`, no `useState`, no `ref.value`, no `$:` annotation. You touch the data, the runtime takes care of the rest.

## Mutate normally

```js
this.count = 5;                  // re-render scheduled
this.user.name = 'Alice';        // re-render scheduled
this.items.push('thing');        // re-render scheduled
this.tasks[3].done = true;       // re-render scheduled
delete this.user.email;          // re-render scheduled
```

Nested objects and arrays are reactive too. The proxy's `get` trap recursively wraps them on first access, so you don't pay the cost of wrapping until something actually reads the nested value.

### What counts as a mutation

| Operation | Triggers a render |
|---|---|
| `this.x = v` | Yes |
| `this.obj.y = v` | Yes |
| `this.arr.push(v)` / `pop` / `splice` / `sort` / `reverse` / `unshift` / `shift` | Yes |
| `this.arr[i] = v` | Yes |
| `delete this.x` | Yes |
| `this.arr.filter(...)` (returns a new array, no mutation) | No. Assign back if you want it reactive: `this.arr = this.arr.filter(...)` |
| Setting `__proto__`, `constructor`, `prototype` | Blocked with a warning |

The last row exists because those keys are pollution attack surfaces; the proxy refuses them. You're unlikely to set them on purpose.

## Updates batch automatically

You don't have to think about coalescing writes. The runtime adds the dirty element to a `Set`, then flushes once on the next animation frame.

```js
this.user.name  = 'Alice';
this.user.age   = 30;
this.user.email = 'alice@x.com';
// → exactly one render, on the next animation frame
```

If a render schedules more writes (an `updated()` hook that mutates more state, say), those go into a pending queue and run on the *next* batch. No drops. No re-entrancy bugs. You can write whatever the user flow demands and trust the runtime to coalesce.

## Only the right things re-render

"Render" doesn't mean "re-run the whole template". The runtime tracks which expressions read which properties, then on a write it re-runs only the bindings that depend on the changed property.

```js
{
  count: 0,
  total: 0,
  inc() { this.count++; }   // only bindings reading `count` re-run
}
```

If a `[[ count ]]` interpolation lives in your template, that's the only DOM operation the next render performs. The total stays alone.

This is why getters compose cleanly:

```js
{
  tasks: [...],
  filter: '',
  get visible() {
    return this.tasks.filter(t => t.title.includes(this.filter));
  }
}
```

```html
<li b-for="task in visible">[[ task.title ]]</li>
```

The runtime sees the binding read `visible`; `visible`'s getter reads `tasks` and `filter`; both get recorded as dependencies of that one binding. Mutate any of them and the binding re-runs. You don't write the dependency list anywhere. The proxy is watching.

There's also a fallback path. If you mutate a property *before* any binding has read it (initial setup, an untracked side path), the runtime can't know which bindings depend on it, so it does a full re-render of the block. Correct, just slightly more work than a fine-grained pass.

::: tip Getter `this` is the proxy
A common reactivity bug in other frameworks: a getter reads other state via `this.x`, but `this` is the raw object, not the reactive one, so the read isn't tracked. LegoDOM passes the proxy as the receiver, so getters that read other state still record dependencies. You can chain getters that read getters and tracking will follow.
:::

## Computed values

You don't need a special API. Use a getter for derived state:

```js
{
  firstName: 'Tersoo',
  lastName:  'Ortserga',
  get fullName() { return `${this.firstName} ${this.lastName}`; }
}
```

```html
<p>[[ fullName ]]</p>
```

Getters re-run on every render that reads them. They're cheap when the work is cheap and tracked when the work touches state. Most computed values you'd reach for `useMemo` for in React are just getters here.

If the computation is expensive and you only want to recompute on specific changes, a method plus a cached property gives you explicit control:

```js
{
  cachedSlug: '',
  rebuildSlug() {
    this.cachedSlug = expensiveSlugify(this.title);
  }
}
```

Call `rebuildSlug()` from a setter on `title` or from `mounted()`, and read `cachedSlug` from your template. The runtime will only re-render bindings that read `cachedSlug` when you assign to it.

## Reacting from outside the template

Three patterns, in order of how often you'll need them.

### `updated()` for "after each render"

```js
{
  updated() {
    console.log('rendered with count', this.count);
  }
}
```

`updated()` runs once per render cycle, on a ~50 ms trailing debounce. A burst of mutations from animations, websockets, or rapid input fires the hook once, not once per write. Use it for side effects that should follow the DOM, like animating a scroll position into place after the list grows.

### Accessor pair for "react when *this* changes"

```js
{
  _count: 0,
  get count() { return this._count; },
  set count(v) {
    const old = this._count;
    this._count = v;
    if (old !== v) this.onCountChanged(old, v);
  },
  onCountChanged(prev, next) { /* ... */ }
}
```

The runtime preserves accessor descriptors when merging logic, so getters and setters survive the three-tier merge intact. Use this when one specific property is interesting and the rest aren't.

### Just call the method from the place that mutates

The dirtiest, simplest way:

```js
addTask(t) {
  this.tasks.push(t);
  this.scrollToBottom();
}
```

When you control the call site, you don't need a hook. Often this is the right answer.

## Sharing state across blocks

Reactivity is per-block by design. A `<user-card>` and a `<task-list>` each have their own proxy bound to their own host element. Mutating one doesn't ripple to the other. That's intentional: a `[[ count ]]` change in one corner of the page can't cause a thousand other blocks to consider whether they need to re-render.

When you do want cross-block reactivity, three doors are open.

### Events, for child-to-parent

```js
// inside a child block
this.$emit('save', { id: 42 });
```

```html
<task-row @save="onSave($event)"></task-row>
```

The default. If a child has news for its parent, dispatch a custom event.

### Globals, for cross-cutting state

```js
Lego.globals.user = { name: 'Alice' };
```

```html
<header>Hi, [[ global.user.name ]]</header>
```

`Lego.globals` is itself a reactive proxy, with one twist: blocks subscribe to it automatically. The template scanner spots `global.x` references and adds the block to a subscriber set. Mutating `Lego.globals.user` re-renders only blocks that read from it. The other 999 blocks on the page don't care, and the runtime knows.

### `$registry` for sibling reads

```html
<p>Cart total: [[ $registry('shopping-cart').total ]]</p>
```

Read another registered block's shared state. Useful for reaching across the tree without prop-drilling. Treat as read-mostly; for writes, prefer a method on the source block, or a global.

## What it's not

Three things LegoDOM's reactivity is **not**:

- **Not a virtual DOM.** No diffing pass, no reconciler, no key-based component identity. The proxy directly schedules the bindings that need to re-run.
- **Not Svelte-style compiler magic.** Reactivity is fully runtime; the proxy is the only mechanism. Code is the same code at runtime as it was on disk.
- **Not Vue's `ref` / `reactive` split.** Every state object becomes one proxy; nested objects become proxies on access. There's no `.value` to remember, no decision about which API a value is.

The trigger comparison, if you're coming from elsewhere:

| Framework | Trigger |
|---|---|
| React | `setState`, `useState`, `useReducer` |
| Vue | `ref.value = v` / `reactive` proxy |
| Svelte | `let x = …; x = newX` (compiled) |
| LegoDOM | `this.x = v` (proxy at runtime) |

## How to think about it

Two things to remember:

1. **`this` is the proxy.** Reads are tracked, writes schedule. Everything follows from that.
2. **Renders are surgical and per-block.** A mutation re-runs only the bindings that depend on the changed property, on the block that owns them. A thousand blocks on the page is the same cost as one when only one of them changes.

You can build a serious app without reading the rest of this page again. When something doesn't update the way you expected, the answer is almost always "the binding didn't read that property" or "you replaced the array reference instead of mutating it".

## Quick reference

| Want to do this | Pattern |
|---|---|
| Update local state | `this.x = v` (anywhere inside the block) |
| Compute a derived value | `get name() { return ... }` then `[[ name ]]` |
| React after each render | `updated() { ... }` (debounced ~50 ms) |
| React only when one property changes | Accessor pair: `get` + `set` |
| Talk to a parent block | `this.$emit('event', detail)` |
| Share state across blocks | `Lego.globals.x = v`; read as `[[ global.x ]]` |
| Read another block's shared state | `$registry('tag-name')` |
| Re-render after a non-mutating array op | Assign back: `this.arr = this.arr.filter(...)` |

That's the whole thing. Mutate normally; the runtime handles the bookkeeping.

## Next

- [Directives](/guide/directives) for what each binding does at render time.
- [Lifecycle](/guide/lifecycle) for when `mounted` / `updated` / `unmounted` fire.
- [The Lego object](/guide/the-lego-object) for what's available on `this` and in template scope.
