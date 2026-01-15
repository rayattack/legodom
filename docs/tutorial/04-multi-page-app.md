# Step 4: Building a Multi-Page App

Let's bring it all together! In this step, we'll complete the **index → login → welcome** flow that every real app needs. You'll see exactly how data flows between pages.

## The Complete App Structure

By the end of this page, you'll have:

```
src/components/
├── home-page.lego      ← Landing page (/)
├── login-page.lego     ← Login form (/login)
└── welcome-page.lego   ← Dashboard (/welcome)
```

## Step 1: Create the Welcome Page

Create `src/components/welcome-page.lego`:

```html
<template>
  <div class="dashboard">
    <header>
      <h1>Welcome, [[ username ]]! 🎉</h1>
      <button @click="handleLogout()">Logout</button>
    </header>
    
    <main>
      <div class="card">
        <h2>You're In!</h2>
        <p>You've successfully navigated through a complete authentication flow built with LegoDOM.</p>
        <p>This page received your username from the login form using global state.</p>
      </div>
      
      <div class="stats">
        <div class="stat">
          <span class="value">[[ visitCount ]]</span>
          <span class="label">Page Views</span>
        </div>
        <div class="stat">
          <span class="value">[[ formatTime() ]]</span>
          <span class="label">Current Time</span>
        </div>
        <div class="stat">
          <span class="value">✓</span>
          <span class="label">Logged In</span>
        </div>
      </div>
      
      <div class="actions">
        <a href="/" b-link class="btn">← Back to Home</a>
      </div>
    </main>
  </div>
</template>

<style>
  self {
    display: block;
    min-height: 100vh;
    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    color: white;
    padding: 2rem;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 800px;
    margin: 0 auto 3rem;
  }
  
  header h1 {
    font-size: 1.75rem;
  }
  
  header button {
    background: rgba(255,255,255,0.1);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  header button:hover {
    background: rgba(255,255,255,0.2);
  }
  
  main {
    max-width: 800px;
    margin: 0 auto;
  }
  
  .card {
    background: rgba(255,255,255,0.05);
    padding: 2rem;
    border-radius: 16px;
    margin-bottom: 2rem;
    border: 1px solid rgba(255,255,255,0.1);
  }
  
  .card h2 {
    color: #4ecca3;
    margin-bottom: 1rem;
  }
  
  .card p {
    opacity: 0.8;
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }
  
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .stat {
    background: rgba(255,255,255,0.05);
    padding: 1.5rem;
    border-radius: 12px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.1);
  }
  
  .stat .value {
    display: block;
    font-size: 2rem;
    font-weight: bold;
    color: #4ecca3;
    margin-bottom: 0.5rem;
  }
  
  .stat .label {
    font-size: 0.85rem;
    opacity: 0.7;
  }
  
  .actions {
    text-align: center;
  }
  
  .btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: #4ecca3;
    color: #1a1a2e;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
  }
</style>

<script>
export default {
  visitCount: 0,
  
  get username() {
    // Get username from global state (set by login page)
    return Lego.globals.user?.name || 'Guest';
  },
  
  mounted() {
    this.visitCount++;
    
    // Redirect to login if not authenticated
    if (!Lego.globals.user) {
      console.log('Not logged in, redirecting...');
      this.$go('/login').get();
    }
  },
  
  formatTime() {
    return new Date().toLocaleTimeString();
  },
  
  handleLogout() {
    // Clear global user state
    Lego.globals.user = null;
    this.$go('/').get();
  }
}
</script>
```

## Step 2: Update Login to Set Global State

The login page needs to store the user in global state. Update `src/components/login-page.lego`'s script section:

```javascript
<script>
export default {
  email: '',
  password: '',
  
  handleSubmit(event) {
    event.preventDefault();
    
    // Store user in GLOBAL state (accessible from any component!)
    Lego.globals.user = {
      name: this.email.split('@')[0],  // Use email prefix as name
      email: this.email,
      loggedInAt: new Date()
    };
    
    console.log('User logged in:', Lego.globals.user);
    
    // Navigate to welcome page
    this.$go('/welcome').get();
  }
}
</script>
```

## Step 3: Update Home Page Navigation

Update `src/components/home-page.lego`'s `handleClick` method:

```javascript
handleClick() {
  this.$go('/login').get();
}
```

## Step 4: Complete `app.js`

Here's the final `src/app.js`:

```javascript
import { Lego } from 'lego-dom';
import registerComponents from 'virtual:lego-components';

// Register all .lego components
registerComponents();

// Define routes
Lego.route('/', 'home-page');
Lego.route('/login', 'login-page');
Lego.route('/welcome', 'welcome-page');

// Initialize with default user state
Lego.globals.user = null;

// Start the engine
await Lego.init();
```

## Test the Complete Flow

```bash
npm run dev
```

1. **Home Page** (`/`) – Click "Get Started"
2. **Login Page** (`/login`) – Enter an email, click "Sign In"
3. **Welcome Page** (`/welcome`) – See your username displayed!
4. Click "Logout" – Clears state, returns to home
5. Try navigating directly to `/welcome` – Redirects to login!

## The Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Lego.globals                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  user: { name: 'john', email: 'john@test.com' }    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         ▲                                    │
         │ writes                             │ reads
         │                                    ▼
   ┌──────────┐                        ┌──────────────┐
   │  login   │                        │   welcome    │
   │  page    │                        │    page      │
   └──────────┘                        └──────────────┘
```

## Auth Guard Pattern

Want to protect routes? Add middleware:

```javascript
// In app.js

const requireAuth = (params, globals) => {
  if (!globals.user) {
    globals.$go('/login').get();
    return false;  // Block navigation
  }
  return true;  // Allow navigation
};

Lego.route('/welcome', 'welcome-page', requireAuth);
Lego.route('/dashboard', 'dashboard-page', requireAuth);
Lego.route('/settings', 'settings-page', requireAuth);
```

## What You've Built

✅ A complete login flow: home → login → welcome  
✅ Global state shared across components  
✅ Logout functionality that clears state  
✅ Automatic redirect when not authenticated  
✅ Route protection with middleware  

## The Full Picture

| File | Purpose |
|------|---------|
| `index.html` | Entry HTML with `<lego-router>` |
| `src/app.js` | Routes, globals, initialization |
| `src/components/*.lego` | Your page components |
| `vite.config.js` | Vite + LegoDOM plugin setup |

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./03-adding-routes" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Previous: Adding Routes
  </a>
  <a href="./05-state-and-globals" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: State & Globals →
  </a>
</div>
