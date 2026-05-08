# Lego.route()

Registers a client-side route. Each route binds a path pattern to a block tag, when the URL matches, the runtime renders that block into the resolved targets.

```ts
Lego.route(
  path: string,
  tagName: string,
  middleware?: (ctx: { path: string; params: Record<string, string> }) => boolean | Promise<boolean>
): void
```

## Path patterns

The path string may contain:

| Token | Meaning |
|---|---|
| `:name` | Named parameter, captured into `$route.params[name]`. Greedy up to the next `/`. |
| `*` | Wildcard, matches anything, including `/`. Useful as a catch-all for `404`. |
| Anything else | Literal. Regex metacharacters (`. + ? ^ $ { } ( ) | [ ] \`) are escaped automatically, so you can use them safely. |

```js
Lego.route('/',                     'home-page');
Lego.route('/users/:id',            'user-page');
Lego.route('/users/:id/orders/:o',  'order-page');
Lego.route('/files/*',              'files-page');   // /files/a/b/c → matches
Lego.route('*',                     'not-found');    // catch-all
```

The order routes are registered does matter, the runtime returns the **first** match. Register specific routes before catch-alls.

## Middleware

The optional third argument is a guard. It receives `{ path, params }` and returns a boolean (or a promise of one). Returning `false` aborts the navigation, `$route` is not committed and no DOM swap happens.

```js
const requireAuth = async ({ path, params }) => {
  const token = Lego.db('auth.token').get();
  if (!token) {
    Lego.globals.$go('/login').get();
    return false;
  }
  return true;
};

Lego.route('/admin',          'admin-page',   requireAuth);
Lego.route('/account/:tab',   'account-page', requireAuth);
```

Middleware runs **before** `$route` is committed. If a faster navigation supersedes a slow one mid-await, the in-flight middleware's verdict is discarded, only the latest navigation wins.

## Outlets

A route renders into one or more **target** elements:

- The default target is the first `<lego-router>` in the document.
- Links with `b-target="#sidebar #main"` route into the matching elements.
- `Lego.globals.$go(path, ...targets).get()` accepts targets as positional args.

If multiple targets are passed, the route block is appended to each, useful for synchronizing two panes from a single click.

```html
<nav>
  <a href="/"      b-link>Home</a>
  <a href="/about" b-link>About</a>
</nav>

<lego-router></lego-router>
```

## What `$route` looks like

After every successful match, `Lego.globals.$route` is updated:

```ts
{
  url: '/users/42?tab=billing', // path + search
  route: '/users/:id',          // the matched pattern
  params: { id: '42' },
  query: { tab: 'billing' },
  method: 'GET',
  body: null
}
```

`$route` is reactive, any block reading `$route.params.id` re-renders when navigation changes the value.

## Examples

### Simple SPA

```js
Lego.route('/',          'home-page');
Lego.route('/users/:id', 'user-page');
Lego.route('*',          'not-found');

await Lego.init();
```

```html
<nav>
  <a href="/" b-link>Home</a>
  <a href="/users/1" b-link>Alice</a>
</nav>
<lego-router></lego-router>
```

### Async middleware that redirects

```js
Lego.route('/admin', 'admin-page', async ({ path }) => {
  const me = await fetch('/api/me').then(r => r.json());
  if (me.role !== 'admin') {
    Lego.globals.$go('/').get();
    return false;
  }
  return true;
});
```

### Surgical updates from JS

```js
// Update only the right pane, no URL change
Lego.globals.$go('/widgets/clock', '#sidebar').get(false);
```

See [`Lego.globals.$go`](/api/globals#go) for the full navigation surface.
