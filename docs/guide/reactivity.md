# Reactivity

How LegoDOM turns "I changed an object" into "the right DOM nodes update". The whole system is a few hundred lines — the model below is faithful to the code, not a marketing pitch.

## The shape of state

Every block's state object is wrapped in a `Proxy` at mount time. The proxy is **per-element** — a `<user-card>` and a `<task-list>` each have their own proxy bound to their own host element. Mutations on one don't bleed into the other.

```js
// in src/core/reactive.js
el._studs = reactive(stateObject, el);
```

Inside the block, `this` (in methods, getters, lifecycle hooks) **is** that proxy. Reads are tracked; writes schedule re-renders.

## Mutate, and the DOM follows

```js
this.count = 5;                  // re-render scheduled
this.user.name = 'Alice';        // re-render scheduled
this.items.push('thing');        // re-render scheduled
delete this.user.email;          // re-render scheduled
```

Nested objects and arrays are reactive too — the proxy's `get` trap recursively wraps them on first access. There's no need to call a special "set" function or import a hook.

### What's reactive

| Operation | Triggers a render? |
|---|---|
| `this.x = v` | Yes |
| `this.obj.y = v` | Yes |
| `this.arr.push(v)` / `pop` / `splice` / `sort` / `reverse` | Yes |
| `this.arr[i] = v` | Yes |
| `delete this.x` | Yes |
| `this.arr.filter(...)` (returns new array, no mutation) | No — assign back to a property if you want it reactive |
| Setting `__proto__`, `constructor`, `prototype` | Blocked with a warning (proxy guards) |

## Batching

Multiple mutations in the same microtask collapse into one render. The runtime adds the dirty element to a `Set`, then flushes once on the next animation frame:

```js
this.user.name  = 'Alice';
this.user.age   = 30;
this.user.email = 'alice@x.com';
// → exactly one render, on the next animation frame
```

Updates added **during** a batch are queued and run in the next batch — no drops, no re-entrancy bugs.

## Fine-grained tracking

Renders aren't whole-block by default. Each binding (a `[[ ]]` interpolation, a `b-if`, an attribute interpolation) is run with a tracking flag set; every property read during the run is recorded as a dependency of that binding.

When a property is later written:

- If at least one binding depends on it, only those bindings re-run on the next batch.
- If no binding has been recorded reading it (e.g. you wrote it before any binding had a chance to read it), the runtime falls back to a full re-render of the block — correct, just less efficient.

```js
{
  count: 0,
  total: 0,
  inc() { this.count++; }   // re-runs only bindings that read `count`
}
```

This is why getters and methods compose cleanly:

```js
{
  tasks: [...],
  filter: '',
  get visible() {
    return this.tasks.filter(t => t.title.includes(this.filter));
  }
}
```

A binding that reads `[[ visible ]]` runs the getter once per render. The runtime sees reads of both `tasks` and `filter` and records both as dependencies of that binding — mutating either re-runs the binding.

::: tip Getter `this` is the proxy
Getters are invoked with the proxy as `this`, not the raw target — so a getter that reads other state still records dependencies. (`Reflect.get(t, k, receiver)` does the work in `src/core/reactive.js`.)
:::

## Per-block scope, not global re-renders

Each block has its own proxy bound to its own element. A mutation on Block A's state schedules re-rendering of A — never B, never the document.

```
1000 blocks on the page,
1 mutation in block 537,
1 block re-rendered.
```

## Globals: opt-in cross-block reactivity

`Lego.globals` is the one exception. It's also a proxy, but its `add()` (the call that schedules a re-render on a mutation) fans out to every block that has been observed reading from it. Blocks subscribe to globals automatically — the scanner spots `global.x` references in templates and adds the block to a `globalSubscribers` set.

```js
Lego.globals.theme = 'dark';
// → only blocks that read `[[ global.theme ]]` (or anything else under `global`)
//   re-render. Blocks with no `global` references are untouched.
```

## Lifecycle of a render

1. **Mutate** — `this.x = v`.
2. **Proxy `set`** — record dirty bindings (or fall through to a full pass), call `batcher.add(el)`.
3. **Schedule** — first call in a tick arms a `requestAnimationFrame`.
4. **Process batch** — for each dirty element, run `render(el)`: dirty-bindings only, or full pass.
5. **`updated()`** — fires after the batch, on a 50 ms trailing debounce. Multiple batches collapse into one hook call.

## The "what about computed properties" question

Use a getter:

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

There's no special API. Tracking takes care of dependency graphs.

You can also use a method when you want explicit calls:

```js
{ format(d) { return new Date(d).toLocaleString(); } }
```

```html
<p>[[ format(task.createdAt) ]]</p>
```

## Watching for changes

Two ways:

```js
{
  // 1. Periodic — fires once per render cycle (~50 ms debounce)
  updated() {
    console.log('rendered', this.count);
  }
}
```

```js
{
  // 2. Targeted — wrap the setter explicitly when you only care about specific changes
  _count: 0,
  get count() { return this._count; },
  set count(v) {
    const old = this._count;
    this._count = v;
    if (old !== v) console.log('count changed from', old, 'to', v);
  }
}
```

The runtime preserves accessor descriptors when merging logic, so getters and setters survive the three-tier merge intact.

## Cross-block communication

Three ways, ordered from cheapest to broadest:

```js
// 1. Events — child to parent
this.$emit('save', { id: 42 });
```

```html
<child-block @save="onSave($event)"></child-block>
```

```js
// 2. Globals — anywhere to anywhere
Lego.globals.user = { name: 'Alice' };
```

```js
// 3. $registry — read another block's shared state
const cart = $registry('shopping-cart');   // proxy of the registered defaults
```

Pick events for parent/child, globals for cross-cutting state, `$registry` for sibling-to-sibling reads.

## What it's not

- It's not a virtual DOM. There's no diff pass, no reconciler, no key-based component identity.
- It's not Svelte-style compiler magic. Reactivity is fully runtime — the proxy is the only mechanism.
- It's not Vue's `ref`/`reactive` split. Every state object becomes one proxy; nested objects become proxies on access.

If you want the surface-level summary for the comparison table:

| Framework | Trigger |
|---|---|
| React | `setState`, `useState` |
| Vue | `ref.value = v` / `reactive` proxy |
| Svelte | `let x = …; x = newX` (compiled) |
| LegoDOM | `this.x = v` (proxy at runtime) |

## Next

- [Directives](/guide/directives) — what each binding actually does at render time.
- [Lifecycle](/guide/lifecycle) — when `mounted` / `updated` / `unmounted` fire.
- [The `Lego` object](/guide/the-lego-object) — what's available on `this` and in template scope.
