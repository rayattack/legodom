# Server-Side Architecture

LegoDOM is designed to play nicely with backend frameworks like **Heaven**, **Django**, **Rails**, or **Go**.

Unlike typical SPAs that require a massive build step, LegoDOM can fetch components **on-demand** from your server. This gives you the routing simplicity of a backend with the interactivity of a frontend framework.

## The Auto-Loader Pattern

Instead of bundling every component `users-list`, `chat-widget`, `billing-modal` into one big `app.js` file, you can load them lazily.

Configure the `loader` hook in your main entry file:

```javascript
Lego.init(document.body, {
  loader: (tagName) => `/components/${tagName}.lego`
});
```

Now, your HTML can just use tags that haven't been defined yet:

```html
<!-- index.html (Server Rendered) -->
<h1>Dashboard</h1>

<!-- LegoDOM sees this, fetches /components/user-feed.lego, and upgrades it -->
<user-feed></user-feed>
```

## Power Mode: Authentication & State

Often you need to pass **Authentication Tokens** or **Global State** to the server to get a personalized component.

Return a `Promise` from your loader to take full control of the fetch:

```javascript
Lego.init(document.body, {
  loader: async (tagName) => {
    const token = localStorage.getItem('jwt');
    
    const response = await fetch(`/components/${tagName}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Theme': Lego.globals.theme
      }
    });

    if (!response.ok) return null;
    return await response.text(); // Return the SFC content
  }
});
```

## Server-Side State Injection

Since the server generates the `.lego` file, it can inject data before sending it to the browser.

**Example (Backend Pseudocode):**

```python
# GET /components/user-card ("Flask-like" syntax)
@app.route('/components/user-card')
def get_user_card():
    user = db.get_current_user()
    
    # We bake the data right into the template!
    return f"""
    <template>
      <div class="card">
        <h2>[[ name ]]</h2>
        <p>Balance: $[[ balance ]]</p>
      </div>
    </template>
    
    <script>
       export default {
         name: "{user.name}", 
         balance: {user.balance}
       }
    </script>
    """
```

The browser receives a component that **already has the data**. No second API call needed!

## Runtime Components

If you fetch component code manually (e.g. via WebSockets or a custom pipeline), you can register it using `Lego.defineSFC`:

```javascript
socket.on('component_update', (msg) => {
  // msg.code contains the <template>... string
  Lego.defineSFC(msg.code, msg.name + '.lego');
});
```
```

## Production Considerations

### 1. Error Handling
What if the server returns a 404 or 500? Your `loader` should handle this gracefully so the user isn't stuck with a blank screen.

```javascript
loader: async (tagName) => {
  try {
    const res = await fetch(`/components/${tagName}.lego`);
    if (!res.ok) {
      console.error(`Component ${tagName} failed: ${res.status}`);
      // Fallback to a generic error component
      return `<template><div class="error">Failed to load ${tagName}</div></template>`;
    }
    return await res.text();
  } catch (err) {
    return `<template><div class="error">Network Error</div></template>`;
  }
}
```

### 2. Caching Strategy
LegoDOM caches the *compiled class* of a component once loaded. It does **not** re-fetch the `.lego` file for every instance.
However, if you want browser-level caching for the HTTP requests, ensure your server sends correct headers:

```http
Cache-Control: public, max-age=3600, immutable
```

### 3. Preloading
If you know a user is about to visit a page (e.g. hovering a link), you can preload the component SFC:

```javascript
const preload = (tagName) => {
  // Just calling the loader puts it in the browser's fetch cache
  Lego.config.loader(tagName); 
};
```
