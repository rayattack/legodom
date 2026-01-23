# Where do you want to go? The Router

The true power of the Lego router isn't just changing the URL; it's the **targeted DOM injection** that allows you to swap _any_ part of the page with _any_ block, without writing a single line of `fetch` or `innerHTML` logic.

## The "Surgical" Philosophy

Most SPAs use a **Replacer Strategy**:
`URL Change -> Match Route -> Destroy App -> Rebuild App with new Page`

LegoDOM uses a **Surgical Strategy**:
`URL Change -> Match Route -> Find Targets (#sidebar, #main) -> Modify ONLY those nodes`

## Location in the Codebase

The router lives in `src/features/router.js`:

```js
// src/features/router.js
import { snap } from '../core/lifecycle.js';
import { registry } from '../core/registry.js';
import { globals } from '../core/globals.js';
import { defineLegoFile } from '../core/parser.js';

export const routes = [];

export const _go = (href, ...targets) => {
  return {
    get: (shouldPush = true) => {
      const [pathname, search] = href.split('?');
      const url = pathname + (search ? `?${search}` : '');
      
      // Update history
      if (shouldPush) {
        history.pushState({ legoTargets: targets }, '', url);
      }
      
      // Update $route global
      globals.$route.url = url;
      globals.$route.method = 'GET';
      
      // Find matching route
      const match = routes.find(r => r.regex.test(pathname));
      if (!match) {
        console.warn(`[Lego Router] No route found for: ${pathname}`);
        return;
      }
      
      // Extract params
      const values = pathname.match(match.regex).slice(1);
      const params = Object.fromEntries(
        match.paramNames.map((n, i) => [n, values[i]])
      );
      const query = Object.fromEntries(new URLSearchParams(search || ''));
      
      globals.$route.route = match.path;
      globals.$route.params = params;
      globals.$route.query = query;
      
      // Determine targets
      const resolvedTargets = targets.length > 0 
        ? targets 
        : ['lego-router'];
      
     // Swap content in each target
      resolvedTargets.forEach(selector => {
        const container = document.querySelector(selector);
        if (!container) {
          console.warn(`[Lego Router] Target not found: ${selector}`);
          return;
        }
        
        // Clear existing content
        container.innerHTML = '';
        
        // Create new block element
        const el = document.createElement(match.tagName);
        container.appendChild(el);
        
        // Snap the new block
        snap(el);
      });
    },
    
    post: (body) => {
      globals.$route.method = 'POST';
      globals.$route.body = body;
      return this.get(true);
    }
  };
};

export const _matchRoute = (targets) => {
  const path = window.location.pathname;
  const search = window.location.search;
  _go(path + search, ...targets).get(false);
};
```

## Route Registration

Routes are registered via `Lego.route()` in `src/index.js`:

```js
// src/index.js
const Lego = {
  route: (path, tagName, options = {}) => {
    // Convert path to regex with param extraction
    const paramNames = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    
    routes.push({
      path,
      tagName,
      regex: new RegExp(`^${pattern}$`),
      paramNames,
      guards: options.guards || []
    });
  }
};
```

Usage:

```js
Lego.route('/users/:id', 'user-profile');
Lego.route('/dashboard', 'dashboard-page');
Lego.route('/posts/:slug/edit', 'post-editor');
```

## Surgical Swapping

The key innovation is the `targets` parameter:

```js
// In your block or HTML:
<a href="/profile" @click.prevent="$go('/profile', '#main', '#sidebar').get()">
  Go to Profile
</a>
```

This will:
1. Navigate to `/profile`
2. Update only `#main` and `#sidebar`
3. Leave everything else untouched

### Why this matters

This architecture enables **Persistent Shells**. You can have:
- A sidebar that plays music or holds chat state
- A main content area that navigates freely
- A header that shows notifications

Traditional routers usually require complex "Layout Blocks" to achieve this. LegoDOM does it by simply *not touching the sidebar*.

## Intelligent Defaults

If no targets are specified, LegoDOM looks for `<lego-router>`:

```js
const resolvedTargets = targets.length > 0 
  ? targets 
  : ['lego-router'];
```

This hybrid approach gives you the best of both worlds:
- **Rapid prototyping**: Just use `<lego-router>` and `$go('/page')`
- **App-like fidelity**: Use surgical targets when needed

## The $route Global

The router updates `globals.$route` (from `src/core/globals.js`):

```js
// src/core/globals.js
export const globals = {
  $route: {
    url: '',
    route: '',
    params: {},
    query: {},
    method: 'GET',
    body: null
  },
  $go: null, // Set by index.js during init
  $db: null  // Set by index.js during init
};
```

You can access route info in any block:

```html
<template>
  <div>
    <h1>User ID: [[ $route.params.id ]]</h1>
    <p>Search: [[ $route.query.search ]]</p>
  </div>
</template>
```

## Link Interception

During `init()`, LegoDOM sets up automatic link interception:

```js
// src/index.js (in Lego.init)
document.addEventListener('click', e => {
  const path = e.composedPath();
  const link = path.find(el => 
    el.tagName === 'A' && 
    (el.hasAttribute('b-target') || el.hasAttribute('b-link'))
  );
  
  if (link) {
    e.preventDefault();
    const href = link.getAttribute('href');
    const targetAttr = link.getAttribute('b-target');
    const targets = targetAttr ? targetAttr.split(/\s+/).filter(Boolean) : [];
    
    globals.$go(href, ...targets).get();
  }
});
```

This allows declarative routing:

```html
<a href="/profile" b-link>My Profile</a>
<a href="/settings" b-target="#main #sidebar">Settings</a>
```

## History Management

The router integrates with the browser's History API:

```js
// Popstate for back/forward buttons
window.addEventListener('popstate', (event) => {
  const targets = event.state?.legoTargets || [];
  _matchRoute(targets);
});
```

When you click the back button, LegoDOM re-applies the same surgical targets that were used for that navigation.

---

**Summary**: The router in `src/features/router.js` uses surgical DOM updates to enable persistent UI shells. It supports parameterized routes, query strings, multiple targets, and integrates seamlessly with the browser's History API. The `$route` global makes route data available everywhere, while `$go` provides programmatic navigation with POST support.
