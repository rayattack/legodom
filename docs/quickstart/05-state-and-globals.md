# 5. State & guards

The tracker works, persists, and routes surgically. What's missing is the cross-cutting glue: a logged-in user that every block can see, an admin route that bounces unauthorized visitors, and an error boundary so a single bad block doesn't take the page down.

We'll add all of it in this chapter. About 80 lines of code total.

## `Lego.globals`: shared, reactive state

Reactivity in LegoDOM is per-block by default. A `<task-list>` and a `<work-tasks>` each have their own state. Mutating one doesn't ripple to the other, which is what you want most of the time.

When you do want cross-block reactivity, `Lego.globals` is the door. It's a reactive object visible to every block, exposed in template scope as `global`. Mutate any property and every block reading it re-renders.

In `src/app.js`, seed it from `localStorage` so the user survives refresh:

```js
Lego.globals.user = Lego.db('user').get();   // null on first load
```

That's the whole setup. `user` is now globally available, automatically reactive, and persisted.

::: tip Why `global` in templates, `Lego.globals` in JS?
The template scope intentionally exposes `global` (singular) because it reads better in HTML attributes. They're the same object. Pick whichever reads cleanest at the call site.
:::

## A login form

Create `src/login-page.lego`:

```html
<script>
export default {
  name: '',
  error: '',
  login() {
    if (!this.name) return;
    const user = { name: this.name, role: this.name === 'admin' ? 'admin' : 'member' };
    Lego.globals.user = user;
    Lego.db('user').set(user);
    this.$go('/').get();
  }
}
</script>

<template>
  <h1>Sign in</h1>
  <form b-action @submit="login()">
    <input b-sync.trim="name" placeholder="Your name" autofocus>
    <button type="submit" b-show="name.length > 0">Sign in</button>
  </form>
  <p b-if="error" class="error">[[ error ]]</p>
</template>

<style>
  self { display: block; max-width: 360px; margin: 4rem auto; font-family: system-ui; }
  h1 { font-size: 1.5rem; }
  form { display: flex; gap: .5rem; }
  input {
    flex: 1; padding: .75rem; border: 2px solid #e0e0e0; border-radius: 8px;
    font-size: 1rem;
  }
  button {
    padding: .75rem 1.25rem; background: #667eea; color: #fff;
    border: 0; border-radius: 8px; font-weight: 600; cursor: pointer;
  }
  .error { color: #c33; }
</style>
```

Two things worth pointing out:

- `Lego.db('user').set(user)` writes to `localStorage` immediately (instead of declaring `user: $db(...)` on this block's state). Both styles work; the imperative style is clearer when the lifecycle isn't tied to the block itself.
- `this.$go('/').get()` is the in-block alias for `Lego.globals.$go(...).get()`. Either works.

Wire up the route in `src/app.js`:

```js
Lego.route('/login', 'login-page');
```

## Show the user in the shell

In `src/app-shell.lego`, replace the `<h2>Tracker</h2>` block:

```html
<h2>Tracker</h2>
<p class="who" b-show="global.user">
  Hi, [[ global.user.name ]] · <a href="#" @click.prevent="logout()">log out</a>
</p>
<p class="who" b-show="!global.user">
  <a href="/login" b-link>Sign in</a>
</p>
```

…and add the logout method:

```js
logout() {
  Lego.globals.user = null;
  Lego.db('user').delete();
  this.$go('/login').get();
}
```

Sign in as anyone. The sidebar updates instantly: greeting, log-out link, the works. No event bus, no callback prop. The shell read `global.user` in its template, so the runtime registered it as a subscriber. When you set `Lego.globals.user`, the shell re-rendered. That's it.

This is the difference between a global store and global *reactive* state: the latter doesn't need any extra wiring at the call site. You write to a property; everything that reads it updates.

## An auth-guarded admin route

Create `src/admin-page.lego`:

```html
<script>
export default {
  resetTasks() {
    Lego.db('tasks.all').delete();
    location.reload();
  }
}
</script>

<template>
  <h1>Admin</h1>
  <p>Logged in as [[ global.user.name ]] (role: [[ global.user.role ]]).</p>
  <button @click="resetTasks()">Reset all tasks</button>
</template>
```

Now register the route **with a middleware**:

```js
const requireAdmin = ({ path, params }) => {
  const u = Lego.globals.user;
  if (!u) {
    Lego.globals.$go('/login').get();
    return false;
  }
  if (u.role !== 'admin') {
    Lego.globals.$go('/').get();
    return false;
  }
  return true;
};

Lego.route('/admin', 'admin-page', requireAdmin);
```

Add an "Admin" link to the shell sidebar, but only when an admin is signed in:

```html
<a href="/admin" b-link b-show="global.user?.role === 'admin'">Admin</a>
```

Sign in as `admin`. The link appears. Click it. You see the admin page. Sign in as `alice` instead. The link is gone, and if you manually navigate to `/admin`, the middleware bounces you back to `/`. Sign out entirely and `/admin` redirects to `/login`.

Three layers of defense, all from a few lines:

- The link is hidden from non-admins (UX).
- The middleware blocks the route from rendering (correctness).
- The middleware can redirect before returning false (graceful failure).

### Middleware contract

The function receives `{ path, params }`. Return:

- `true`, allow navigation.
- `false`, abort. `$route` doesn't commit; nothing in the DOM swaps.
- A promise of either, the route waits for it. If a faster navigation arrives mid-await, the in-flight verdict is silently discarded.

That last point matters in practice. A user clicking around quickly while a permissions check resolves doesn't end up in a half-rendered state. The latest navigation always wins.

## Error boundaries

The last piece. You want to make sure a single bad block can't take the whole page down.

Create `src/error-card.lego`:

```html
<script>
export default {
  retry() { location.reload(); }
}
</script>

<template>
  <div class="card">
    <h3>Something went wrong</h3>
    <p>[[ $error.message ]]</p>
    <details>
      <summary>Stack</summary>
      <pre>[[ $error.stack ]]</pre>
    </details>
    <button @click="retry()">Reload</button>
  </div>
</template>

<style>
  .card {
    margin: 2rem; padding: 1.5rem; background: #fee; border: 1px solid #c33;
    border-radius: 8px; font-family: system-ui;
  }
  pre { white-space: pre-wrap; }
</style>
```

Then attach the boundary on the shell template:

```html
<template b-error="error-card">
  …existing template…
</template>
```

Throw an error from any descendant block (a typo in `task-list.lego`'s `mounted()` works for testing) and the runtime catches it, renders `<error-card>` in place of the crashing block, and exposes `$error: { message, stack, component }` to the fallback.

The boundary cascades: a block without its own `b-error` bubbles up to its nearest ancestor that has one. There's also a recursion limit (3 deep) so an error block that itself crashes doesn't loop forever.

## Where you are

You now have:

- A persistent shell with surgical routing.
- Tasks stored in `localStorage`, synced across tabs.
- A logged-in user surfaced via `Lego.globals`.
- Route guards.
- Error boundaries.

That's what most "production frameworks" call a stack. You did it in five files and roughly 150 lines of script. No state-management library, no client-side router npm package, no error-boundary HOC, no localStorage abstraction. Just the runtime and your code.

[Next: Dynamic mounting →](./06-dynamic-mounting)
