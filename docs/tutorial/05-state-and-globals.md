# Step 5: State, Guards & Beyond

Your task tracker works, persists data, and has surgical navigation. Let's add the final layer: global state for cross-component communication, route guards for protection, and a few more features that show the depth of LegoDOM.

## Global State with `Lego.globals`

So far, each block has its own local state. But what about data that multiple blocks need to access — a logged-in user, a theme preference, a notification count?

That's what `Lego.globals` is for. It's a single reactive object shared across every block in your app.

### Set Up Auth State

Update `src/main.js`:

```javascript
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

// Global state — accessible from any block
Lego.globals.user = null;
Lego.globals.theme = 'light';

// Routes
Lego.route('/', 'app-shell');
Lego.route('/work', 'app-shell');
Lego.route('/personal', 'app-shell');
Lego.route('/add', 'app-shell');
Lego.route('/login', 'login-page');

await Lego.init();
```

### Create a Login Page

Create `src/blocks/login-page.lego`:

```html
<template>
  <div class="login">
    <div class="card">
      <h1>Sign In</h1>
      <form @submit.prevent="handleLogin()">
        <input b-sync="email" type="email" placeholder="Email" required>
        <input b-sync="password" type="password" placeholder="Password" required>
        <button type="submit">Sign In</button>
      </form>
      <p b-show="error" class="error">[[ error ]]</p>
    </div>
  </div>
</template>

<style>
  self {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #1a1a2e;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .card {
    background: white;
    padding: 2.5rem;
    border-radius: 12px;
    width: 100%;
    max-width: 380px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }

  h1 { text-align: center; color: #333; margin-bottom: 1.5rem; }

  input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  input:focus { outline: none; border-color: #667eea; }

  button {
    width: 100%;
    padding: 0.85rem;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .error { color: #e74c3c; text-align: center; margin-top: 1rem; }
</style>

<script>
export default {
  email: '',
  password: '',
  error: '',

  handleLogin() {
    if (!this.email || !this.password) {
      this.error = 'Please fill in all fields';
      return;
    }

    // Set global user state — every block can now see this
    Lego.globals.user = {
      name: this.email.split('@')[0],
      email: this.email
    };

    this.$go('/').get();
  }
}
</script>
```

### Use Globals in Your Shell

Update `src/blocks/app-shell.lego`'s template to show the user:

```html
<template>
  <div class="layout">
    <aside class="sidebar">
      <h2>Tracker</h2>

      <div class="user-info" b-show="global.user">
        <span>Hi, [[ global.user?.name ]]</span>
        <button @click="logout()" class="logout-btn">Sign out</button>
      </div>

      <nav>
        <a href="/" b-target="#content">All Tasks</a>
        <a href="/work" b-target="#content">Work</a>
        <a href="/personal" b-target="#content">Personal</a>
        <a href="/add" b-target="#content" class="add-link">+ Add Task</a>
      </nav>

      <div class="sidebar-footer">
        <p>[[ taskCount ]] total tasks</p>
      </div>
    </aside>

    <main id="content">
      <task-list></task-list>
    </main>
  </div>
</template>
```

Add the logout method to the script:

```javascript
<script>
export default {
  taskCount: 0,

  mounted() {
    this.taskCount = 6;
  },

  logout() {
    Lego.globals.user = null;
    this.$go('/login').get();
  }
}
</script>
```

The `global` keyword in templates gives you direct access to `Lego.globals`. When `Lego.globals.user` changes — from any block, anywhere — every block that references `global.user` updates automatically.

## Route Guards with Middleware

Want to protect the dashboard so only logged-in users can access it? Add a middleware function to your routes.

Update `src/main.js`:

```javascript
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';

registerBlocks();

Lego.globals.user = null;
Lego.globals.theme = 'light';

// Middleware: check auth before allowing navigation
const requireAuth = (params, globals) => {
  if (!globals.user) {
    globals.$go('/login').get();
    return false;   // Block this navigation
  }
  return true;      // Allow it
};

// Public routes
Lego.route('/login', 'login-page');

// Protected routes — requireAuth runs before the block loads
Lego.route('/', 'app-shell', requireAuth);
Lego.route('/work', 'app-shell', requireAuth);
Lego.route('/personal', 'app-shell', requireAuth);
Lego.route('/add', 'app-shell', requireAuth);

await Lego.init();
```

Now navigating to `/` without logging in redirects to `/login`. After signing in, `Lego.globals.user` is set and the middleware lets you through.

## Cross-Block Communication with Events

Blocks can talk to each other using custom events with `$emit`:

```html
<!-- child-block.lego -->
<template>
  <button @click="send()">Notify Parent</button>
</template>

<script>
export default {
  send() {
    this.$emit('task-added', { name: 'New task' });
  }
}
</script>
```

```html
<!-- parent-block.lego -->
<template>
  <child-block @task-added="handleNew(event)"></child-block>
</template>

<script>
export default {
  handleNew(event) {
    console.log(event.detail.name);  // "New task"
  }
}
</script>
```

Events bubble up through the component tree. The parent listens with `@event-name`, the child fires with `$emit`.

## Viewport Animations with `b-enter`

Want to trigger something when an element scrolls into view? Use `b-enter`:

```html
<div b-for="task in tasks">
  <div b-enter="onVisible()" class="task-card">
    [[ task.name ]]
  </div>
</div>
```

```javascript
export default {
  onVisible() {
    // Fires when the element enters the viewport
    // Great for lazy loading, analytics, or animations
  }
}
```

Add `.once` to trigger only the first time:

```html
<div b-enter.once="loadImage()">...</div>
```

There's also `b-leave` for when an element exits the viewport.

## Error Boundaries

Wrap a block in an error boundary so crashes don't take down the whole app:

```html
<!-- In your template -->
<template b-error="error-display">
  <!-- If anything in here throws, error-display renders instead -->
  <risky-block></risky-block>
</template>
```

```html
<!-- error-display.lego -->
<template>
  <div class="error-card">
    <h2>Something went wrong</h2>
    <p>[[ $error.message ]]</p>
  </div>
</template>
```

The error boundary catches render errors, lifecycle hook errors, and event handler errors. The crashed component is replaced with your fallback block.

## What You've Built

Let's step back and look at what you have:

| Feature | How You Did It |
|---------|---------------|
| Reactive components | `.lego` files with state in `<script>` |
| Lists, conditionals, forms | `b-for`, `b-if`, `b-show`, `b-sync` |
| Surgical navigation | `b-target="#content"` on links |
| Persistent data | `$db('key').default(value)` |
| Shared state | `Lego.globals` + `global.` in templates |
| Route protection | Middleware functions on `Lego.route()` |
| Component events | `$emit()` and `@event-name` |

All of this in a ~10kb framework with zero dependencies.

## The Full Architecture

```
main.js                        Lego.globals
  │                                │
  ├── Lego.route(...)             │  user, theme, etc.
  ├── Lego.globals.user = ...     │  Reactive — any block
  └── Lego.init()                 │  can read/write
                                   │
          ┌────────────────────────┤
          │                        │
    ┌─────┴──────┐          ┌──────┴──────┐
    │ app-shell  │          │ login-page  │
    │            │          │             │
    │ sidebar    │          │  sets       │
    │ #content ──┼── swaps  │  globals.   │
    │            │   only   │  user       │
    └────────────┘   this   └─────────────┘
          │
    ┌─────┼──────────┐
    │     │          │
  task  work    personal
  list  tasks    tasks
    │
    └── $db('key')  ← persists to localStorage
```

## Keep Going

You've covered the core of LegoDOM. Here's where to go next:

- [Blocks Deep Dive](/guide/blocks) — Composition, slots, logic tiers
- [All Directives](/guide/directives) — `b-html`, `b-text`, `b-init`, `b-var`, and more
- [Routing Guide](/guide/routing) — Advanced surgical swaps, cold entry, history
- [Persistence Guide](/guide/persistence) — Cross-tab sync, quota management, IndexedDB
- [Error Handling](/guide/error-handling) — Error boundaries and fallback patterns
- [API Reference](/api/) — Complete method signatures

---

<div style="display: flex; justify-content: space-between; margin-top: 2rem;">
  <a href="/tutorial/04-multi-page-app" style="text-decoration: none; color: #667eea; font-weight: 500;">← 4. Persistence & Forms</a>
  <a href="/tutorial/06-dynamic-mounting" style="text-decoration: none; color: #667eea; font-weight: 500;">6. Dynamic Mounting →</a>
</div>
