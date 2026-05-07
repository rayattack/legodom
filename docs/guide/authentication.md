# Authentication Patterns

This guide covers practical patterns for adding authentication to a LegoDOM application using the framework's built-in features: `$db` for persistent token storage, route middleware for guards, `Lego.globals` for shared auth state, and slots for conditional rendering.

## Token Storage with `$db`

Use `$db` to persist authentication tokens in `localStorage`. This gives you automatic reactivity and cross-tab synchronization.

```html
<!-- login-page.lego -->
<template>
  <form @submit.prevent="login()">
    <h2>Sign In</h2>
    <input b-sync="email" type="email" placeholder="Email">
    <input b-sync="password" type="password" placeholder="Password">
    <p b-show="error" class="error">[[ error ]]</p>
    <button type="submit" b-show="!loading">Sign In</button>
    <p b-show="loading">Signing in...</p>
  </form>
</template>

<script>
export default {
  email: '',
  password: '',
  error: '',
  loading: false,

  async login() {
    this.loading = true;
    this.error = '';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email,
          password: this.password
        })
      });

      if (!res.ok) {
        this.error = 'Invalid email or password';
        return;
      }

      const data = await res.json();

      // Store the token — persists across reloads and syncs across tabs
      $db('auth.token').set(data.token);
      $db('auth.user').set(data.user);

      // Navigate to the dashboard
      this.$go('/dashboard').get();
    } catch (err) {
      this.error = 'Network error. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}
</script>

<style>
  self { display: block; max-width: 400px; margin: 2rem auto; }
  form { display: flex; flex-direction: column; gap: 1rem; }
  input { padding: 0.75rem; border: 1px solid #ccc; border-radius: 4px; }
  button { padding: 0.75rem; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .error { color: #c33; margin: 0; }
</style>
```

### Logout

```js
logout() {
  $db('auth.token').delete();
  $db('auth.user').delete();
  this.$go('/login').get();
}
```

Because `$db` syncs across tabs, logging out in one tab will immediately clear the token in all other open tabs.

## Auth Guard Component

Create a wrapper block that conditionally shows content based on authentication state. This uses the slot pattern to wrap protected content.

```html
<!-- auth-guard.lego -->
<template>
  <div b-if="isAuthenticated">
    <slot></slot>
  </div>
  <login-page b-if="!isAuthenticated"></login-page>
</template>

<script>
export default {
  // $db creates a reactive binding — when the token changes, the UI updates
  token: $db('auth.token').default(null),

  get isAuthenticated() {
    return !!this.token;
  }
}
</script>
```

**Usage in your app:**

```html
<!-- index.html -->
<auth-guard>
  <app-shell>
    <lego-router></lego-router>
  </app-shell>
</auth-guard>
```

When there's no token, the `<login-page>` renders. Once the user logs in (and `$db('auth.token')` gets a value), the guard re-renders and shows the app shell with the router.

## Route Middleware

For finer-grained control, use route middleware to protect specific routes. Middleware runs before the route swap and can block navigation.

```js
// app.js
const requireAuth = async ({ path, params }) => {
  const token = $db('auth.token').get();
  if (!token) {
    Lego.globals.$go('/login').get();
    return false; // Block navigation
  }
  return true; // Allow navigation
};

const requireAdmin = async ({ path, params }) => {
  const user = $db('auth.user').get();
  if (!user || user.role !== 'admin') {
    Lego.globals.$go('/unauthorized').get();
    return false;
  }
  return true;
};

// Public routes
Lego.route('/', 'home-page');
Lego.route('/login', 'login-page');

// Protected routes
Lego.route('/dashboard', 'dashboard-page', requireAuth);
Lego.route('/settings', 'settings-page', requireAuth);
Lego.route('/admin', 'admin-panel', requireAdmin);

// Catch-all
Lego.route('*', 'not-found-page');

Lego.init(document.body);
```

## Global User State

Share user information across all blocks using `Lego.globals`:

```js
// app.js — Set up global auth state
Lego.init(document.body);

// Load user from persistent storage into globals
const savedUser = $db('auth.user').get();
if (savedUser) {
  Lego.globals.user = savedUser;
}
```

Access in any block template:

```html
<p b-show="global.user">Welcome, [[ global.user.name ]]</p>
<p b-show="!global.user">Please sign in</p>
```

Access in block logic:

```js
export default {
  mounted() {
    if (Lego.globals.user) {
      this.loadUserData(Lego.globals.user.id);
    }
  }
}
```

## Cross-Tab Synchronization

Because `$db` uses the browser's `storage` event for cross-tab sync, authentication state is automatically shared:

1. User logs in on **Tab A** → `$db('auth.token').set(token)`
2. **Tab B** detects the storage change → re-renders blocks using the token
3. User logs out on **Tab B** → `$db('auth.token').delete()`
4. **Tab A** detects the deletion → auth guard shows login page

No extra code needed — this works automatically with `$db`.

## Authenticated API Requests

Create a reusable pattern for making authenticated API calls:

```html
<!-- user-dashboard.lego -->
<template>
  <div b-show="loading">Loading...</div>
  <div b-show="!loading && data">
    <h1>Dashboard</h1>
    <p>Welcome, [[ data.name ]]</p>
  </div>
  <div b-show="!loading && error">
    <p>[[ error ]]</p>
    <button @click="fetchData()">Retry</button>
  </div>
</template>

<script>
export default {
  data: null,
  loading: true,
  error: '',

  mounted() {
    this.fetchData();
  },

  async fetchData() {
    this.loading = true;
    this.error = '';

    const token = $db('auth.token').get();

    try {
      const res = await fetch('/api/dashboard', {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (res.status === 401) {
        // Token expired — clear and redirect
        $db('auth.token').delete();
        this.$go('/login').get();
        return;
      }

      this.data = await res.json();
    } catch (err) {
      this.error = 'Failed to load dashboard data';
    } finally {
      this.loading = false;
    }
  }
}
</script>
```

## Complete Example: Full Auth Flow

Here's a complete mini-app with login, protected dashboard, and logout:

```js
// app.js
import 'lego-dom';
import 'virtual:lego-blocks';

const requireAuth = async () => {
  if (!$db('auth.token').get()) {
    Lego.globals.$go('/login').get();
    return false;
  }
  return true;
};

Lego.route('/login', 'login-page');
Lego.route('/dashboard', 'dashboard-page', requireAuth);
Lego.route('/', 'dashboard-page', requireAuth);
Lego.route('*', 'not-found-page');

Lego.init(document.body);
```

```html
<!-- index.html -->
<body>
  <lego-router></lego-router>
  <script type="module" src="./src/app.js"></script>
</body>
```

```html
<!-- src/nav-bar.lego -->
<template>
  <nav>
    <a href="/dashboard" b-link>Dashboard</a>
    <button @click="logout()">Sign Out</button>
  </nav>
</template>

<script>
export default {
  logout() {
    $db('auth.token').delete();
    $db('auth.user').delete();
    this.$go('/login').get();
  }
}
</script>
```

## Best Practices

### Always Namespace Token Keys

```js
// Good — namespaced
$db('myapp.auth.token')

// Bad — too generic, could collide with other apps on the same domain
$db('token')
```

### Handle Token Expiry

Check for 401 responses in your API calls and redirect to login:

```js
if (res.status === 401) {
  $db('auth.token').delete();
  this.$go('/login').get();
  return;
}
```

### Combine Auth Guard + Route Middleware

Use the auth guard component for the overall app shell, and route middleware for role-based access:

```html
<auth-guard>
  <app-shell>
    <lego-router></lego-router>
  </app-shell>
</auth-guard>
```

```js
// Public routes don't need middleware (auth-guard handles login)
Lego.route('/', 'home-page');

// Admin-only routes need extra middleware
Lego.route('/admin', 'admin-panel', requireAdmin);
```

### Don't Store Sensitive Data in $db

`$db` uses `localStorage`, which is accessible to any JavaScript on the page. Store only tokens and non-sensitive user info (name, role). Never store passwords or sensitive PII.

## Next Steps

- See [Persistence ($db)](/guide/persistence) for the full `$db` API
- Learn about [Routing](/guide/routing) for route middleware details
- Explore [Error Handling](/guide/error-handling) for handling auth-related errors
