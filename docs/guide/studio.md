# Lego Studio

Lego Studio is a zero-config component development environment built into LegoDOM. It provides a visual interface to browse, preview, and inspect your components during development.

![Lego Studio Interface](https://via.placeholder.com/800x450/1e293b/ffffff?text=Lego+Studio+Screenshot)

## Features

- **Component Browser** - Browse all registered components in your app
- **Live Preview** - See components render in isolation
- **State Inspector** - View and edit component state in real-time
- **Hot Reload** - Changes reflect instantly during development
- **Zero Config** - Enable with a single option

---

## Quick Start

Enable Studio in your app initialization:

```javascript
import { Lego } from 'lego-dom';

Lego.init(document.body, {
  studio: true  // ✨ That's it!
});
```

Then navigate to `/_/studio` in your browser:

```
http://localhost:5173/_/studio
```

---

## How It Works

When `studio: true` is set, LegoDOM automatically:

1. **Loads the Studio component** from CDN (`@legodom/studio`)
2. **Registers two routes**:
   - `/_/studio` - Studio home page
   - `/_/studio/:component` - Component preview page
3. **Discovers all components** using `Lego.getLegos()`

The Studio runs entirely in your browser - no backend required!

---

## Using the Studio

### Browsing Components

The left sidebar shows all registered components in your app. Use the search box to filter by name.

Click any component to preview it in the center canvas.

### Inspecting State

The right panel shows the component's reactive state as JSON. You can:

- **View** current state values
- **Edit** state directly in the JSON editor
- **See changes** reflected in the preview instantly

### URL Deep Linking

Each component has a unique URL:

```
/_/studio/my-component
/_/studio/todo-list
/_/studio/user-card
```

Share these URLs with your team to showcase specific components!

---

## Configuration

### CDN Version

By default, Studio loads from unpkg CDN. LegoDOM uses a pinned version for stability:

```javascript
// In main.js (LegoDOM core)
script.src = 'https://unpkg.com/@legodom/studio@0.0.2/dist/lego-studio.js';
```

### Custom Studio URL

If you want to use a different CDN or self-host the Studio, you'll need to manually load it:

```javascript
// Load Studio manually before Lego.init
import '@legodom/studio';

Lego.init(document.body, {
  studio: true
});
```

---

## Production Builds

**Important:** Studio is designed for **development only**. 

### Disable in Production

```javascript
Lego.init(document.body, {
  studio: import.meta.env.DEV  // Only enable in dev mode
});
```

Or use environment variables:

```javascript
Lego.init(document.body, {
  studio: process.env.NODE_ENV === 'development'
});
```

### Why Disable in Production?

- **Security**: Exposes component internals and state
- **Performance**: Adds ~6KB gzipped overhead
- **UX**: Users don't need development tools

---

## Examples

### Basic Usage

```javascript
// src/main.js
import { Lego } from 'lego-dom';
import './components/button.lego';
import './components/card.lego';

Lego.init(document.body, {
  studio: true
});
```

Visit `http://localhost:5173/_/studio` to see your components!

### With Vite

Vite provides `import.meta.env.DEV` which is `true` in development:

```javascript
// src/main.js
import { Lego } from 'lego-dom';

Lego.init(document.body, {
  studio: import.meta.env.DEV  // Only enabled in dev mode
});
```

### With Routing

Studio routes are automatically registered and won't conflict with your app routes:

```javascript
Lego.route('/', 'home-page');
Lego.route('/about', 'about-page');

Lego.init(document.body, {
  studio: true  // Adds /_/studio routes
});
```

Your app routes (`/`, `/about`) and Studio routes (`/_/studio`) coexist peacefully!

---

## Troubleshooting

### Studio doesn't load

**Check the console** for errors. Common issues:

1. **CDN blocked** - Check your network/firewall
2. **Version mismatch** - Ensure LegoDOM and Studio versions are compatible
3. **Route conflict** - Make sure you don't have a route for `/_/studio`

### Components don't appear

Make sure your components are registered before navigating to Studio:

```javascript
// ❌ Wrong - components not loaded yet
Lego.init(document.body, { studio: true });
import './components/button.lego';  // Too late!

// ✅ Correct - load components first
import './components/button.lego';
Lego.init(document.body, { studio: true });
```

### State changes don't persist

Studio edits are **temporary** and only affect the preview instance. Refresh the page to reset.

This is by design - Studio is for experimentation, not data persistence.

---

## Advanced: Custom Studio

You can build your own Studio-like tool using LegoDOM's public APIs:

```javascript
// Get all registered components
const components = Lego.getLegos();

// Create a component instance
const el = document.createElement('my-component');
document.body.appendChild(el);

// Initialize it manually
Lego.snap(el);

// Access its state
const state = el.state;
console.log(state);

// Update state
el.state = { count: 5 };
```

See [Advanced API](/api/advanced) for more details.

---

## FAQ

### Is Studio included in LegoDOM?

No, Studio is a **separate package** (`@legodom/studio`) loaded on-demand from CDN when `studio: true` is set.

### Does it work with CDN usage?

Yes! Studio works with both npm and CDN setups:

```html
<script type="module">
  import { Lego } from 'https://unpkg.com/lego-dom';
  
  Lego.init(document.body, {
    studio: true  // Works!
  });
</script>
```

### Can I customize the Studio UI?

Not currently. Studio is a pre-built component. If you need customization, consider building your own dev tools using the [Advanced API](/api/advanced).

### Does it support TypeScript?

Studio itself is JavaScript, but it works with TypeScript projects. Component state is displayed as JSON regardless of the source language.

---

## Related

- [Lego.init()](/api/config#init) - Initialization options
- [Advanced API](/api/advanced) - `Lego.snap()`, `Lego.unsnap()`
- [Component Development](/guide/components) - Building components
- [Lifecycle Hooks](/api/lifecycle) - Component lifecycle

---

## Feedback

Studio is in early development. Found a bug or have a feature request?

[Open an issue on GitHub](https://github.com/rayattack/LegoDOM/issues) →
