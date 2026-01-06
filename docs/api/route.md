# Lego.route()

Client-side routing.

## Type Signature

```ts
Lego.route(path: string, componentOrHtml: string | HTMLElement)
```

## Arguments

- **path**: The URL path pattern (e.g., `/users/:id`).
- **componentOrHtml**: The tag name of the component to render, or raw HTML.

## Example

```js
// Route to a component
Lego.route('/', 'home-page');
Lego.route('/about', 'about-page');

// Route with params
Lego.route('/user/:id', 'user-profile');
```

## Router Outlet

You must have a `<router-outlet>` in your DOM where the routed content will appear.

```html
<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>
<router-outlet></router-outlet>
```
