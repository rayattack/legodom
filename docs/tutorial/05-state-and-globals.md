# 5. State & guards

Your tracker works, persists, and routes surgically. Now add the cross-cutting glue: global state for the current user, an auth-guarded admin route, and an error boundary so a single bad block doesn't take the page down.

## `Lego.globals` — shared, reactive

`Lego.globals` is a reactive object visible to every block. Read it from templates as `global.x`. Write it from anywhere — every block that reads it re-renders.

In `src/app.js`:

```js
Lego.globals.user = $db('user').get();   // null on first load
```

That's it. `user` is now globally available, automatically reactive, and seeded from `localStorage` (so it survives refresh).

::: tip Why `global` in templates, `Lego.globals` in JS?
The template scope intentionally exposes `global` (singular) because it reads better in attributes. They're the same object.
:::

## A login form

Create `src/login-page.lego`:

```html
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
```

Two things to note:

- `Lego.db('user').set(user)` writes the user to localStorage immediately. We could have used a `$db` descriptor on a state property instead — both work; this is the imperative style.
- `this.$go('/').get()` is the in-block alias for `Lego.globals.$go(...).get()`.

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

The `b-show="global.user"` lines are reactive on the global. Every block reading `global.user` is re-rendered when you set it — so the moment login succeeds, the sidebar updates without manual coordination.

Wire up the route in `src/app.js`:

```js
Lego.route('/login', 'login-page');
```

## An auth-guarded admin route

Create `src/admin-page.lego`:

```html
<template>
  <h1>Admin</h1>
  <p>Logged in as [[ global.user.name ]] (role: [[ global.user.role ]]).</p>
  <button @click="resetTasks()">Reset all tasks</button>
</template>

<script>
export default {
  resetTasks() {
    Lego.db('tasks.all').delete();
    location.reload();
  }
}
</script>
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

Then add an "Admin" link to the shell sidebar:

```html
<a href="/admin" b-target="#content" b-show="global.user?.role === 'admin'">
  Admin
</a>
```

Now sign in as `admin` (any other name is a non-admin member). Notice:

- The `Admin` link only renders for admins (`b-show` reacts to globals).
- A non-admin who manually navigates to `/admin` is bounced back home.
- A logged-out user visiting `/admin` lands on `/login`.

## Middleware contract

Middleware receives `{ path, params }`. Returning:

- `true` — allow navigation (route renders).
- `false` — abort. `$route` is not committed; nothing in the DOM swaps.
- A promise — the route waits for it. If a faster navigation arrives mid-await, the in-flight verdict is discarded.

The middleware function can `$go` somewhere else before returning false (as we do above) — the next navigation cleanly supersedes the aborted one.

## Error boundaries

The last piece: don't let a single block crash the page. Create `src/error-card.lego`:

```html
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

<script>
export default {
  retry() { location.reload(); }
}
</script>
```

Then attach the boundary on the shell template:

```html
<template b-error="error-card">
  …existing template…
</template>
```

Throw an error from any descendant — say, a typo in `task-list.lego`'s `mounted()` — and the runtime catches it, renders `<error-card>` in place of the crashing block, and exposes `$error: { message, stack, component }` to the fallback.

The boundary cascades: a block without its own `b-error` bubbles up to its nearest ancestor that has one. There's also a recursion limit (3 deep) so an error boundary that itself crashes won't loop.

## Where you are

You now have:

- A persistent shell with surgical routing.
- Tasks stored in `localStorage` with cross-tab sync.
- A logged-in user surfaced via `Lego.globals`.
- Route guards.
- Error boundaries.

That's what most "production frameworks" call a stack. You did it in five files and ~150 lines of script logic.

[Next: Dynamic mounting →](./06-dynamic-mounting)
