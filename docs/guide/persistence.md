# Persistence (`$db`)

`$db` treats `localStorage` as first-class reactive state. Declare a `$db` descriptor on a state property and the runtime hydrates from disk on mount, writes back on every mutation, and broadcasts changes to other tabs — for free.

## Quick example

```html
<!-- user-prefs.lego -->
<template>
  <h1>Theme: [[ theme ]]</h1>
  <input type="range" b-sync="volume">
</template>

<script>
export default {
  theme:  $db('prefs.theme').default('light'),
  volume: $db('prefs.volume').default(50).debounce(300)
}
</script>
```

Drag the slider — the in-memory value updates instantly. The localStorage write is debounced 300 ms, so dragging won't hammer disk. Open the same URL in another tab — both tabs sync.

## How it works

When the proxy spots a `$db` descriptor as a property value at mount time, it:

1. Reads `localStorage[key]`. If present, parses it as JSON; otherwise uses `default(v)`.
2. Replaces the descriptor with the resolved value, so the property behaves like any other reactive value.
3. Records the binding so future writes flow through `scheduleSave` (with optional debounce).
4. Subscribes the binding to a single shared `storage` listener for cross-tab sync.

A re-entrancy guard prevents the obvious feedback loop: an incoming cross-tab value is applied without re-firing a save.

## Initialization API (fluent)

```js
$db('key')                  // descriptor
  .default(initial)         // value to use if storage is empty
  .debounce(ms)             // delay between mutation and disk write
```

Both methods are optional and chainable; both return the descriptor.

```js
{
  cart:   $db('cart').default([]),
  search: $db('search').default('').debounce(250),
  size:   $db('size').default('M')
}
```

::: tip Namespace your keys
`localStorage` is shared by every script on the origin. Use prefixes like `myapp.theme`, not bare `theme`. The runtime's quota-eviction logic only evicts keys this app wrote, but reading bare keys can still collide with third-party storage.
:::

## Runtime API

You can use the descriptor directly without binding it to state:

```js
$db('user').set({ name: 'Alice' });          // immediate write
$db('user').set({ name: 'Bob' }, 200);       // debounced write
const u = $db('user').get();                 // synchronous read
$db('user').delete();                        // remove + notify bindings
```

`set` and `delete` notify every block currently bound to that key, in addition to writing to disk.

In JS contexts outside a block, use `Lego.db` (or `Lego.globals.$db`):

```js
import { Lego } from 'lego-dom';
Lego.db('auth.token').set(token);
```

## Debouncing high-frequency writes

`localStorage` is synchronous and blocking. Hammering it during a scroll, drag, or every-keystroke binding will cause UI jank on slower devices. Debounce inputs that mutate often:

```js
{
  draft: $db('post.draft').default('').debounce(500)
}
```

The first mutation arms a timer. Each subsequent mutation within the window pushes the deadline back. The user pauses → the save fires.

## Cross-tab sync

Bindings to the same key in different tabs stay in sync via the browser's `storage` event:

1. Open the app in tab A and tab B.
2. Change a `$db` value in tab A.
3. Tab B re-renders with the new value.

A single `storage` listener handles every key — there's no per-binding overhead.

## Quota and eviction

Browsers cap `localStorage` (typically ~5 MB). When a write exceeds the quota:

1. The runtime catches `QuotaExceededError`.
2. It evicts the **oldest** keys this app wrote (FIFO) until 2× the needed space is free.
3. The write is retried.

If retry still fails, `Lego.config.onError` fires with `type: 'quota-critical'`. Eviction never touches keys this app didn't write — third-party `localStorage` usage is left alone.

## Patterns

### Auth token

```js
{
  token: $db('auth.token').default(null),

  async login(creds) {
    const { token } = await fetch('/login', { method: 'POST', body: JSON.stringify(creds) }).then(r => r.json());
    this.token = token;     // saved to disk + broadcast across tabs
  },

  logout() {
    this.token = null;      // saved as null
  }
}
```

### Form draft auto-save

```js
{
  draft: $db('post.draft').default('').debounce(500),

  publish() {
    fetch('/posts', { method: 'POST', body: this.draft });
    this.draft = '';        // clears in-memory and on disk
  }
}
```

### Computed reads

```js
{
  user: $db('user').default(null),
  get displayName() {
    return this.user?.name ?? 'Guest';
  }
}
```

The getter reads `this.user` — the runtime tracks that read, so any cross-tab update of the user re-runs the binding that displayed `displayName`.

## Use in `.lego` script vs `b-logic`

Both work. `$db` is exposed as a top-level identifier in both contexts.

```html
<!-- script -->
<script>
export default {
  theme: $db('theme').default('light')
}
</script>
```

```html
<!-- template-level b-logic -->
<template b-id="user-prefs" b-logic="{ theme: $db('theme').default('light') }">…</template>
```

```html
<!-- instance-level b-logic -->
<user-prefs b-logic="{ theme: $db('user-99.theme').default('light') }"></user-prefs>
```
