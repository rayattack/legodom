# Lego.route()

Client-side routing.

## Type Signature

```ts
Lego.route(path: string, tagName: string, middleware?: Function)
```

## Arguments

- **path**: The URL path pattern (e.g., `/users/:id`).
- **tagName**: The tag name of the block to render in the router outlet.
- **middleware**: Optional async function for guards (returns boolean).

## Example

```js
// Route to a block
Lego.route('/', 'home-page');
Lego.route('/about', 'about-page');

// Route with params and middleware
Lego.route('/user/:id', 'user-profile', async (params, global) => {
  return global.auth.isLoggedIn;
});
```

## Router Outlet

You must have a `<lego-router>` in your DOM where the routed content will appear.

```html
<nav>
  <a href="/" b-link>Home</a>
  <a href="/about" b-link>About</a>
</nav>

<lego-router></lego-router>
```
