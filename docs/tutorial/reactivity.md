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

Dependencies are owned by the binding, and they are re-collected on every run. A binding inside an `if` that stops reading `a` and starts reading `b` stops waking on `a` from that render onwards. Nothing accumulates.

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

Getters are cached. The runtime evaluates one the first time something reads it, remembers both the value and the state it touched while computing, and hands back the remembered value on every later read until one of those pieces of state actually changes. An expensive getter read by five bindings runs once, not five times, and a mutation elsewhere in state doesn't make it run at all. That's `useMemo`, without the dependency array and without you asking for it.

```js
{
  title: '',
  tags: [],
  get slug() { return expensiveSlugify(this.title); }   // runs when `title` changes
}
```

Pushing to `tags` here does not re-run `slug`, because `slug` never read `tags`.

::: warning A getter that reads nothing reactive is a constant
Caching is keyed on what the getter read. `get now() { return Date.now(); }` reads no state, so nothing can ever invalidate it: it keeps the value from its first evaluation for the life of the block. Call a method instead when you want a fresh value every time.
:::

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

### `$watch` for "react when *this* changes"

```js
{
  count: 0,
  query: '',
  mounted() {
    this.$watch('count', (next, prev) => console.log(next, prev));
    this.$watch(s => s.query.trim(), q => this.search(q), { immediate: true });
  }
}
```

`$watch` takes a dotted key path or a function receiving the state proxy, and fires only when the value actually changes (compared with `Object.is`). It returns a stop function, and every watcher a block created is stopped for you when the block unmounts.

Outside a block, `Lego.watch(source, cb)` does the same thing against `Lego.globals`, and `Lego.effect(fn)` re-runs `fn` whenever anything it read changes. Both return a stop function, and neither is stopped for you.

An accessor pair still works too, and is the right shape when the reaction belongs to the write rather than to a subscriber:

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

The runtime preserves accessor descriptors when merging logic, so getters and setters survive the three-tier merge intact.

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

Each block gets its own state object, so a `<user-card>` and a `<task-list>` don't see each other's data. What crosses the boundary is the *object*: hand the same object to two blocks and both track it, and a mutation through either one updates both. Bindings are what subscribe, not elements, so the other 998 blocks on the page are undisturbed.

When you want cross-block reactivity on purpose, three doors are open.

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

`Lego.globals` is an ordinary reactive object, tracked exactly like block state: a binding that reads `global.user.name` depends on `user` and on that object's `name`, so mutating `Lego.globals.theme` leaves it alone. Nothing inspects your expression source to work this out; the read itself is the subscription.

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
2. **Renders are surgical.** A mutation re-runs the bindings that read the changed property, wherever they live: one row of a list, one block, or two blocks sharing an object. A thousand blocks on the page is the same cost as one when only one of them changes.

You can build a serious app without reading the rest of this page again. When something doesn't update the way you expected, the answer is almost always "the binding didn't read that property" or "you replaced the array reference instead of mutating it".

## Quick reference

| Want to do this | Pattern |
|---|---|
| Update local state | `this.x = v` (anywhere inside the block) |
| Compute a derived value | `get name() { return ... }` then `[[ name ]]` |
| React after each render | `updated() { ... }` (debounced ~50 ms) |
| React only when one property changes | `this.$watch('key', cb)`, or an accessor pair |
| Talk to a parent block | `this.$emit('event', detail)` |
| Share state across blocks | `Lego.globals.x = v`; read as `[[ global.x ]]` |
| Read another block's shared state | `$registry('tag-name')` |
| React to globals outside a block | `Lego.watch('key', cb)` / `Lego.effect(fn)` |
| Re-render after a non-mutating array op | Assign back: `this.arr = this.arr.filter(...)` |

That's the whole thing. Mutate normally; the runtime handles the bookkeeping.

## Next

- [Directives](/tutorial/directives) for what each binding does at render time.
- [Lifecycle](/tutorial/lifecycle) for when `mounted` / `updated` / `unmounted` fire.
- [The Lego object](/tutorial/the-lego-object) for what's available on `this` and in template scope.
