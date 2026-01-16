# Step 5: State & Globals

You've built a complete app! Now let's understand how state management works in LegoDOM and explore advanced patterns.

## Two Levels of State

### 1. Component State (Local)

Each component has its own reactive state defined in the `<script>` section:

```javascript
export default {
  // This is local to THIS component instance
  count: 0,
  items: [],
  
  increment() {
    this.count++;  // Triggers re-render of THIS component only
  }
}
```

### 2. Global State (`Lego.globals`)

Shared across ALL components. Perfect for user sessions, themes, shopping carts, etc.

```javascript
// In app.js or any component
Lego.globals.user = { name: 'John' };
Lego.globals.theme = 'dark';
Lego.globals.cart = [];

// In any component
console.log(Lego.globals.user.name);  // 'John'
```

## Accessing Globals in Components

### In JavaScript (Methods)

```javascript
export default {
  mounted() {
    // Direct access
    console.log(Lego.globals.user);
  },
  
  toggleTheme() {
    Lego.globals.theme = Lego.globals.theme === 'dark' ? 'light' : 'dark';
  }
}
```

### In Templates

Use the `global` keyword:

```html
<template>
  <p>Hello, [[ global.user.name ]]!</p>
  <div class="[[ global.theme ]]">
    Content styled by theme
  </div>
  <button b-show="global.user">Logout</button>
</template>
```

## Route State (`$route`)

Access current route information:

```javascript
// Available in any component
this.$route.url       // '/users/42?tab=posts'
this.$route.route     // '/users/:id'
this.$route.params    // { id: '42' }
this.$route.query     // { tab: 'posts' }
```

```html
<template>
  <h1>User [[ $route.params.id ]]</h1>
  <p>Current tab: [[ $route.query.tab ]]</p>
</template>
```

## State Patterns

### Pattern 1: User Authentication

```javascript
// app.js
Lego.globals.user = null;  // Initialize

// login-page.lego
handleLogin() {
  Lego.globals.user = { name: 'John', token: 'abc123' };
  this.$go('/dashboard').get();
}

// Any protected component
mounted() {
  if (!Lego.globals.user) {
    this.$go('/login').get();
  }
}
```

### Pattern 2: Theme Switching

```javascript
// app.js
Lego.globals.theme = localStorage.getItem('theme') || 'light';

// theme-toggle.lego
<template>
  <button @click="toggle()">
    [[ global.theme === 'dark' ? '☀️' : '🌙' ]]
  </button>
</template>

<script>
export default {
  toggle() {
    const newTheme = Lego.globals.theme === 'dark' ? 'light' : 'dark';
    Lego.globals.theme = newTheme;
    localStorage.setItem('theme', newTheme);
    document.body.className = newTheme;
  }
}
</script>
```

### Pattern 3: Shopping Cart

```javascript
// app.js
Lego.globals.cart = [];

// product-card.lego
addToCart() {
  Lego.globals.cart.push({
    id: this.product.id,
    name: this.product.name,
    price: this.product.price
  });
}

// cart-icon.lego
<template>
  <span class="cart">
    🛒 [[ global.cart.length ]]
  </span>
</template>
```

### Pattern 4: Fetching Data

```javascript
export default {
  users: [],
  loading: true,
  error: null,
  
  async mounted() {
    try {
      const response = await fetch('/api/users');
      this.users = await response.json();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  }
}
```

```html
<template>
  <div b-show="loading">Loading...</div>
  <div b-show="error" class="error">[[ error ]]</div>
  <ul b-show="!loading && !error">
    <li b-for="user in users">[[ user.name ]]</li>
  </ul>
</template>
```

## Cross-Component Communication

### Using `$emit` (Child to Parent)

```html
<!-- child-component.lego -->
<template>
  <button @click="notifyParent()">Click Me</button>
</template>

<script>
export default {
  notifyParent() {
    this.$emit('custom-event', { message: 'Hello from child!' });
  }
}
</script>
```

```html
<!-- parent-component.lego -->
<template>
  <child-component @custom-event="handleEvent(event)"></child-component>
</template>

<script>
export default {
  handleEvent(event) {
    console.log(event.detail.message);  // 'Hello from child!'
  }
}
</script>
```

### Using `$ancestors` (Access Parent Element + State)

```javascript
// In a deeply nested component
mounted() {
  // Get state from a specific ancestor by tag name
  const parentState = this.$ancestors('user-profile');
  console.log(parentState.state.userId);
}
```

## Best Practices

| Do | Don't |
|----|-------|
| ✅ Use `Lego.globals` for truly global state (user, theme) | ❌ Put everything in globals |
| ✅ Keep component state local when possible | ❌ Over-engineer state management |
| ✅ Initialize globals in `app.js` | ❌ Initialize globals in random components |
| ✅ Use `$emit` for child→parent communication | ❌ Reach into child component internals |

## Complete State Cheatsheet

| I want to... | Use this |
|--------------|----------|
| Store component-local data | `export default { myData: ... }` |
| Share data app-wide | `Lego.globals.myData = ...` |
| Read global in template | `[[ global.myData ]]` |
| Read global in JS | `Lego.globals.myData` |
| Get route params | `this.$route.params.id` |
| Get query string | `this.$route.query.tab` |
| Notify parent component | `this.$emit('event-name', data)` |
| Navigate with state | Set globals before `$go()` |

## What's Next?

🎉 **Congratulations!** You've completed the LegoDOM tutorial!

You now know how to:
- Set up a project from scratch
- Create beautiful components
- Navigate between pages
- Share state across your app

### Continue Learning

- [Components Deep Dive](/guide/components) – Advanced component patterns
- [Directives Reference](/guide/directives) – All `b-*` directives explained
- [Routing Guide](/guide/routing) – Surgical swaps and advanced routing
- [API Reference](/api/) – Complete API documentation

### Get Help

- 💬 [GitHub Discussions](https://github.com/rayattack/LegoDOM/discussions)
- 🐛 [Report Issues](https://github.com/rayattack/LegoDOM/issues)

---

<div style="text-align: center; margin-top: 3rem; padding: 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; color: white;">
  <h2 style="margin-bottom: 1rem;">You Did It! 🚀</h2>
  <p style="opacity: 0.9; margin-bottom: 1.5rem;">You've built a complete multi-page app with LegoDOM.</p>
  <a href="/guide/" style="display: inline-block; background: white; color: #667eea; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600;">
    Explore More Guides →
  </a>
</div>
