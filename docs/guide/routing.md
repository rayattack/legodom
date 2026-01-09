# Routing

Lego includes a built-in client-side router for building single-page applications.

## Basic Setup

### 1. Add Router Outlet

```html
<lego-router></lego-router>
```

This is where your routed components will render.

### 2. Define Routes

```js
Lego.route('/', 'home-page');
Lego.route('/about', 'about-page');
Lego.route('/contact', 'contact-page');
```

### 3. Create Page Components

```html
<template b-id="home-page">
  <h1>Home</h1>
  <p>Welcome to the homepage!</p>
</template>

<template b-id="about-page">
  <h1>About</h1>
  <p>Learn more about us.</p>
</template>
```

### 4. Add Navigation

```html
<nav>
  <a href="/" b-link>Home</a>
  <a href="/about" b-link>About</a>
  <a href="/contact" b-link>Contact</a>
</nav>

<lego-router></lego-router>
```

The `b-link` attribute hijacks clicks to prevent page reloads.

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My SPA</title>
  <style>
    nav { padding: 1rem; background: #f0f0f0; }
    nav a { margin-right: 1rem; text-decoration: none; }
    nav a.active { font-weight: bold; }
  </style>
</head>
<body>
  <nav>
    <a href="/" b-link>Home</a>
    <a href="/blog" b-link>Blog</a>
    <a href="/about" b-link>About</a>
  </nav>
  
  <lego-router></lego-router>
  
  <template b-id="home-page">
    <h1>Welcome Home</h1>
    <p>This is the homepage.</p>
  </template>
  
  <template b-id="blog-page">
    <h1>Blog</h1>
    <ul>
      <li><a href="/blog/1" b-link>First Post</a></li>
      <li><a href="/blog/2" b-link>Second Post</a></li>
    </ul>
  </template>
  
  <template b-id="about-page">
    <h1>About Us</h1>
    <p>We build awesome things.</p>
  </template>
  
  <script src="https://unpkg.com/lego-dom/main.js"></script>
  <script>
    Lego.route('/', 'home-page');
    Lego.route('/blog', 'blog-page');
    Lego.route('/about', 'about-page');
  </script>
</body>
</html>
```

## Dynamic Routes

Use `:param` syntax for URL parameters:

```js
Lego.route('/user/:id', 'user-profile');
Lego.route('/blog/:slug', 'blog-post');
Lego.route('/category/:cat/item/:id', 'product-detail');
```

### Accessing Parameters

Route parameters are available in `global.params`:

```html
<template b-id="user-profile">
  <h1>User Profile</h1>
  <p>User ID: {{ global.params.id }}</p>
  <button @click="loadUser()">Load User</button>
</template>

<script>
  Lego.define('user-profile', 
    Lego.registry['user-profile'].innerHTML, {
    async loadUser() {
      const userId = Lego.globals.params.id;
      const user = await fetch(`/api/users/${userId}`).then(r => r.json());
      this.username = user.name;
    }
  });
</script>
```

## Programmatic Navigation

Navigate programmatically using the History API:

```js
// Navigate to a new route
history.pushState({}, '', '/about');
window.dispatchEvent(new PopStateEvent('popstate'));

// Or in a component method:
{
  goToAbout() {
    history.pushState({}, '', '/about');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
```

## Route Middleware

Add middleware for authentication, logging, etc:

```js
// Define middleware function
const authMiddleware = (params, globals) => {
  if (!globals.isLoggedIn) {
    history.pushState({}, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return false; // Block navigation
  }
  return true; // Allow navigation
};

// Apply to routes
Lego.route('/dashboard', 'dashboard-page', authMiddleware);
Lego.route('/profile', 'profile-page', authMiddleware);
```

### Middleware Example

```js
// Logging middleware
const logger = (params) => {
  console.log('Navigating to:', params);
  return true;
};

// Analytics middleware
const analytics = (params) => {
  if (window.gtag) {
    gtag('event', 'page_view', { page_path: window.location.pathname });
  }
  return true;
};

// Apply
Lego.route('/products/:id', 'product-page', (params, globals) => {
  logger(params);
  analytics(params);
  return true;
});
```

## Active Link Styling

Style active navigation links:

```js
// Update active class on navigation
window.addEventListener('popstate', () => {
  document.querySelectorAll('[b-link]').forEach(link => {
    const isActive = link.getAttribute('href') === window.location.pathname;
    link.classList.toggle('active', isActive);
  });
});
```

## 404 / Not Found

Handle unknown routes:

```js
// Define all your routes
Lego.route('/', 'home-page');
Lego.route('/about', 'about-page');

// Catch-all for 404
const matchRoute = () => {
  const path = window.location.pathname;
  const routes = ['/', '/about']; // Your known routes
  
  if (!routes.includes(path)) {
    // Show 404
    document.querySelector('lego-router').innerHTML = '<not-found></not-found>';
  }
};

window.addEventListener('popstate', matchRoute);
matchRoute(); // Initial check
```

## Nested Routes

While Lego doesn't have built-in nested routing, you can implement it:

```html
<template b-id="blog-layout">
  <aside>
    <a href="/blog/posts" b-link>Posts</a>
    <a href="/blog/authors" b-link>Authors</a>
  </aside>
  <main>
    <blog-posts b-show="global.params.section === 'posts'"></blog-posts>
    <blog-authors b-show="global.params.section === 'authors'"></blog-authors>
  </main>
</template>
```

```js
Lego.route('/blog/:section', 'blog-layout');
```

## Query Strings

Access query parameters using URLSearchParams:

```js
{
  mounted() {
    const params = new URLSearchParams(window.location.search);
    this.searchQuery = params.get('q') || '';
    this.page = parseInt(params.get('page')) || 1;
  }
}
```

Example: `/search?q=legojs&page=2`

## Hash vs History Mode

Lego uses History API (pushState) by default, giving you clean URLs:

✅ `/about`  
✅ `/user/123`  
✅ `/blog/my-post`

Not hash-based:  
❌ `#/about`  
❌ `#/user/123`

### Server Configuration

For clean URLs to work, configure your server to serve `index.html` for all routes:

**nginx:**
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

**Apache (.htaccess):**
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

**Node.js/Express:**
```js
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
```

## Best Practices

### 1. Centralize Route Definitions

```js
// routes.js
const routes = {
  '/': 'home-page',
  '/blog': 'blog-page',
  '/blog/:slug': 'blog-post',
  '/user/:id': 'user-profile',
  '/about': 'about-page'
};

Object.entries(routes).forEach(([path, component]) => {
  Lego.route(path, component);
});
```

### 2. Loading States

```html
<template b-id="user-profile">
  <div b-show="loading">Loading...</div>
  <div b-show="!loading">
    <h1>{{ user.name }}</h1>
    <p>{{ user.bio }}</p>
  </div>
</template>
```

### 3. Error Handling

```js
{
  async loadData() {
    this.loading = true;
    this.error = null;
    try {
      const data = await fetch('/api/data').then(r => r.json());
      this.data = data;
    } catch (err) {
      this.error = 'Failed to load data';
    } finally {
      this.loading = false;
    }
  }
}
```

## Limitations

- No nested router outlets (single level only)
- No route guards (use middleware instead)
- No automatic scroll restoration
- Routes must be defined upfront (not lazy-loaded)

For complex routing needs, consider integrating a dedicated router library.

## Next Steps

- See [routing examples](/examples/routing)
- Learn about [lifecycle hooks](/guide/lifecycle)
- Explore [state management patterns](/guide/reactivity)
