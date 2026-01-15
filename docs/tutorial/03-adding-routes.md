# Step 3: Adding Routes

Now let's make your app navigable. By the end of this page, you'll understand exactly **where routes go**, **how to define them**, and **how to navigate between pages**.

## The Golden Question: Where Do Routes Go?

**Answer: In your entry file (`app.js`), before `Lego.init()`.**

```javascript
// src/app.js

import { Lego } from 'lego-dom';
import registerComponents from 'virtual:lego-components';

// 1. Register components
registerComponents();

// 2. Define ALL your routes here ⭐
Lego.route('/', 'home-page');
Lego.route('/login', 'login-page');
Lego.route('/welcome', 'welcome-page');
Lego.route('/users/:id', 'user-profile');  // Dynamic route

// 3. Initialize (must come AFTER routes)
await Lego.init();
```

::: tip Why Before init()?
`Lego.init()` starts the router. If routes aren't defined yet, the router has nothing to match. Always define routes **before** calling `init()`.
:::

## Route Syntax

```javascript
Lego.route(path, componentName, middleware?)
```

| Argument | Description | Example |
|----------|-------------|---------|
| `path` | URL pattern | `'/'`, `'/login'`, `'/users/:id'` |
| `componentName` | The component to render (filename minus `.lego`) | `'home-page'`, `'login-page'` |
| `middleware` | Optional guard function | `(params, globals) => boolean` |

### Dynamic Routes

Use `:param` for URL parameters:

```javascript
Lego.route('/users/:id', 'user-profile');
Lego.route('/posts/:postId/comments/:commentId', 'comment-view');
```

Access them in your component:

```javascript
// In your .lego file's <script>
mounted() {
  const userId = this.$route.params.id;
  console.log('User ID:', userId);
}
```

## Navigating Between Pages

### Method 1: The `b-link` Attribute (Declarative)

```html
<!-- In any component template -->
<a href="/login" b-link>Go to Login</a>
<a href="/users/42" b-link>View User 42</a>
```

The `b-link` attribute turns a regular `<a>` tag into a SPA link. No page reload!

### Method 2: The `$go()` Helper (Programmatic)

```javascript
// In your component methods
handleLoginClick() {
  this.$go('/login').get();
}

// Or with the global reference
Lego.globals.$go('/welcome').get();
```

### Method 3: Using `b-target` (Surgical Updates)

Want to update only a specific part of the page?

```html
<!-- Update just the sidebar, not the whole page -->
<a href="/sidebar/settings" b-target="#sidebar" b-link="false">Settings</a>
```

## Create a Login Page

Let's add a login page to navigate to.

Create `src/components/login-page.lego`:

```html
<template>
  <div class="login-container">
    <h1>Login</h1>
    <form @submit="handleSubmit(event)">
      <div class="form-group">
        <label>Email</label>
        <input type="email" b-sync="email" placeholder="you@example.com" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" b-sync="password" placeholder="••••••••" required>
      </div>
      <button type="submit">Sign In</button>
    </form>
    <p class="back-link">
      <a href="/" b-link>← Back to Home</a>
    </p>
  </div>
</template>

<style>
  self {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f5f5f5;
  }
  
  .login-container {
    background: white;
    padding: 3rem;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    width: 100%;
    max-width: 400px;
  }
  
  h1 {
    text-align: center;
    margin-bottom: 2rem;
    color: #333;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #555;
  }
  
  input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }
  
  input:focus {
    outline: none;
    border-color: #667eea;
  }
  
  button {
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  }
  
  button:hover {
    transform: translateY(-2px);
  }
  
  .back-link {
    text-align: center;
    margin-top: 1.5rem;
  }
  
  .back-link a {
    color: #667eea;
    text-decoration: none;
  }
</style>

<script>
export default {
  email: '',
  password: '',
  
  handleSubmit(event) {
    event.preventDefault();
    console.log('Login attempt:', this.email);
    
    // Navigate to welcome page
    this.$go('/welcome').get();
  }
}
</script>
```

## Update Your Routes

```javascript
// src/app.js
import { Lego } from 'lego-dom';
import registerComponents from 'virtual:lego-components';

registerComponents();

Lego.route('/', 'home-page');
Lego.route('/login', 'login-page');    // Add this!

await Lego.init();
```

## Wire Up Navigation from Home

Update `home-page.lego`'s button to navigate:

```javascript
// In the <script> section
handleClick() {
  this.$go('/login').get();
}
```

## Test It!

```bash
npm run dev
```

1. Open `http://localhost:5173` – see your home page
2. Click "Get Started" – navigates to `/login`
3. Click "← Back to Home" – navigates back to `/`
4. Use browser back/forward – it just works!

## What You've Learned

✅ Routes go in `app.js`, before `Lego.init()`  
✅ `Lego.route(path, component)` maps URLs to components  
✅ `b-link` on `<a>` tags for declarative navigation  
✅ `$go(path).get()` for programmatic navigation  
✅ Dynamic routes with `:param` syntax  

## Quick Reference

| I want to... | Use this |
|--------------|----------|
| Define a route | `Lego.route('/path', 'component-name')` |
| Navigate via link | `<a href="/path" b-link>Click</a>` |
| Navigate via JS | `this.$go('/path').get()` |
| Get route params | `this.$route.params.id` |

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./02-your-first-component" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Previous: Your First Component
  </a>
  <a href="./04-multi-page-app" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Multi-Page App →
  </a>
</div>
