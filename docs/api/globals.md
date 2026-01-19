# Global Helpers

LegoDOM exposes a few globals for managing state and routing across the application.

## Lego.globals

A reactive global state object. Changes to this object will automatically update any component that uses it.

### Usage

Initialize it via `Lego.init()` which binds it to the document body (or root).

```js
// main.js
Lego.globals.user = { name: 'Alice', isLoggedIn: true };

// In any component HTML
// <span>[[ global.user.name ]]</span>
```

### Accessing in JavaScript

You can import `Lego` to access it anywhere:

```js
import { Lego } from './main.js';

function logout() {
  Lego.globals.user.isLoggedIn = false; // Updates UI everywhere
}
```

## Lego.globals.$route

Access the current route state.

```js
console.log(Lego.globals.$route.params); // URL parameters e.g. { id: "123" }
console.log(Lego.globals.$route.query);  // Query string params e.g. { sort: "asc" }
console.log(Lego.globals.$route.url);    // Full URL path + query
```

## Lego.globals.$go

Programmatic navigation helper.

```js
// Navigate to /profile
Lego.globals.$go('/profile').get();

// Fetch to /api/save and push history state
Lego.globals.$go('/api/save').post({ data: 123 });
```
