# Lego.globals

A reactive object shared across every block. Mutate any property and every block that reads it re-renders. Use it for cross-cutting state, current user, theme, feature flags, anything you'd reach for a "store" for.

```js
import { Lego } from 'lego-dom';

Lego.globals.user = { name: 'Alice', role: 'admin' };
Lego.globals.theme = 'dark';
```

In templates, the globals object is available under the name **`global`**:

```html
<header>
  Hi [[ global.user.name ]] · theme: [[ global.theme ]]
</header>
```

In block logic, use `Lego.globals` directly, or the per-block aliases (`this.$route`, `this.$go`, `this.$mount`).

::: tip Why `global` in templates, `Lego.globals` in JS?
The template scope intentionally exposes `global` (singular) because it reads better in attribute strings. Inside JS files outside a block, you can either import `Lego` or use `globalThis.Lego`, both reference the same object.
:::

## Built-in entries

The runtime seeds four reactive entries on startup. They are documented below.

### $route

```ts
$route: {
  url: string;          // pathname + search, e.g. '/users/42?tab=billing'
  route: string;        // matched pattern, e.g. '/users/:id'
  params: Record<string, string>;
  query: Record<string, string>;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: any;
}
```

Updated on every successful route match.

```html
<h1>User #[[ $route.params.id ]]</h1>
<p b-show="$route.query.debug">Debug mode</p>
```

```js
mounted() {
  console.log(this.$route.params, this.$route.query);
}
```

`$params` is a shorthand alias for `$route.params` available inside template expressions.

### $go

Programmatic navigation. The first call binds the path and (optionally) targets, the returned object exposes one method per HTTP verb to actually fire the navigation.

```ts
$go(path: string, ...targets: string[]) => {
  get:    (push?: boolean) => Promise<void>;
  post:   (data: any, push?: boolean) => Promise<void>;
  put:    (data: any, push?: boolean) => Promise<void>;
  patch:  (data: any, push?: boolean) => Promise<void>;
  delete: (push?: boolean) => Promise<void>;
}
```

| Argument | Default | Meaning |
|---|---|---|
| `path` |, | URL pathname (with or without leading `/`). |
| `targets` | `[]` | CSS selectors. If omitted, defaults to the first `<lego-router>`. |
| `push` | `true` | Push a new history entry (set to `false` for silent updates). |

```js
// Standard navigation, pushes history
Lego.globals.$go('/profile').get();

// Surgical update of a side panel, keeps URL
Lego.globals.$go('/widgets/clock', '#sidebar').get(false);

// Form submission style, body is recorded in history state
Lego.globals.$go('/api/save').post({ data: 123 });
```

The verb only affects what's stored in `history.state` (so a back-then-forward navigation can replay it). The route table still resolves by **path**, not by method, pick the verb that documents intent.

### $mount

Imperatively mount (or unmount) a tag inside a target.

```ts
$mount(tagName: string | null, target?: string | HTMLElement | HTMLElement[], props?: object): HTMLElement | HTMLElement[] | undefined
```

| Form | Effect |
|---|---|
| `$mount('user-card')` | Returns a detached element; you `appendChild` it yourself. |
| `$mount('user-card', '#main')` | Clears `#main` and mounts a fresh `<user-card>` into it. |
| `$mount('user-card', '#main', { id: 42 })` | Same, with `id: 42` injected as initial state. |
| `$mount(null, '#main')` | Clears `#main`. |

`$mount` is the imperative cousin of [`b-mount`](/api/directives#b-mount). Both flow through `Lego.mount`.

### $db

Persistence factory. See [`Lego.db`](/api/advanced#lego-db) for the full surface, the descriptor it returns supports `default(v)`, `debounce(ms)` (init-time, fluent), and `set/get/delete` (runtime).

```js
// Persistent state on a block
{
  theme: $db('theme').default('light'),
  draft: $db('draft').default('').debounce(500)
}
```

```js
// Direct read/write from JS
Lego.globals.$db('user').set({ name: 'Alice' });
const user = Lego.globals.$db('user').get();
```

Cross-tab sync is automatic: a write in one tab fans out to every other tab via the `storage` event.

## Adding your own entries

You can add anything to `Lego.globals` and it becomes reactive immediately:

```js
Lego.globals.user      = null;
Lego.globals.cart      = [];
Lego.globals.featureFlags = { newCheckout: false };
```

Mutating any nested property, `Lego.globals.user.name = 'Bob'`, `Lego.globals.cart.push(item)`, will re-render every block that reads it. The proxy is recursive.

## Read-only access

Inside expressions, prefer reads over writes, globals are intended as a propagation surface, not a free-for-all bus. Three good patterns:

```js
// 1. Bootstrap once in app entry
Lego.globals.user = await fetchMe();

// 2. Mutate from a focused method
async function logout() {
  Lego.globals.user = null;
  Lego.globals.$go('/login').get();
}

// 3. Read freely from anywhere
{
  get isAdmin() { return Lego.globals.user?.role === 'admin'; }
}
```
