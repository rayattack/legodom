# Single File Components (.lego)

Single File Components (SFCs) let you define components in dedicated `.lego` files when using Vite as your build tool.

## Why SFCs?

When your project grows, keeping

 components in separate files makes your codebase more organized and maintainable.

### Benefits

✅ **Better Organization** - One file per component  
✅ **Syntax Highlighting** - Proper editor support  
✅ **Auto-discovery** - Vite plugin finds and registers components automatically  
✅ **Hot Reload** - Changes reflect instantly during development  
✅ **Familiar Format** - Similar to Vue SFCs if you've used them

## File Format

A `.lego` file contains three optional sections:

```html
<template>
  <!-- Your component markup -->
</template>

<script>
// Your component logic
export default {
  // reactive state and methods
}
</script>

<style>
  /* Scoped styles */
</style>
```

### Example Component

Here's a complete example (`user-card.lego`):

```html
<template>
  <style>
    self {
      display: block;
      padding: 1.5rem;
      border: 2px solid #ddd;
      border-radius: 8px;
      max-width: 300px;
    }
    
    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .name {
      font-size: 1.5rem;
      font-weight: bold;
      margin: 0.5rem 0;
    }
    
    .bio {
      color: #666;
      margin: 0.5rem 0;
    }
    
    button {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
    }
  </style>
  
  <img class="avatar" src="{{ avatarUrl }}" alt="{{ name }}">
  <h2 class="name">{{ name }}</h2>
  <p class="bio">{{ bio }}</p>
  <p>Followers: {{ followers }}</p>
  <button @click="follow()">
    {{ isFollowing ? 'Unfollow' : 'Follow' }}
  </button>
</template>

<script>
export default {
  name: 'John Doe',
  bio: 'Web developer & coffee enthusiast',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
  followers: 1234,
  isFollowing: false,
  
  follow() {
    if (this.isFollowing) {
      this.followers--;
      this.isFollowing = false;
    } else {
      this.followers++;
      this.isFollowing = true;
    }
  }
}
</script>
```

## Vite Plugin Setup

### Installation

```bash
npm install -D vite lego-dom
```

### Configuration

Create or update `vite.config.js`:

```js
import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [
    legoPlugin({
      componentsDir: './src/components',  // Where to look
      include: ['**/*.lego']              // What to match
    })
  ]
});
```

### Project Structure

```
my-app/
├── src/
│   ├── components/
│   │   ├── user-card.lego
│   │   ├── post-list.lego
│   │   └── comment-item.lego
│   └── main.js
├── index.html
├── package.json
└── vite.config.js
```

### Entry Point

In your `src/main.js`:

```js
import { Lego } from 'lego-dom/main.js';
import registerComponents from 'virtual:lego-components';

// Auto-register all discovered components
registerComponents();

// Now all .lego components are available!
```

### Use Components

In your `index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My LegoJS App</title>
</head>
<body>
  <div id="app">
    <user-card></user-card>
    <post-list></post-list>
  </div>
  
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

## Component Naming

Component names are automatically derived from filenames:

| Filename | Component Tag |
|----------|--------------|
| `user-card.lego` | `<user-card>` |
| `post-list.lego` | `<post-list>` |
| `comment-item.lego` | `<comment-item>` |

::: warning Naming Rules
Component names **must**:
- Be kebab-case (lowercase with hyphens)
- Contain at least one hyphen
- Match the pattern: `[a-z][a-z0-9]*(-[a-z0-9]+)+`

✅ Good: `user-card`, `post-list`, `nav-menu`  
❌ Bad: `UserCard`, `postlist`, `card`
:::

## Section Details

### Template Section

Contains your component's HTML markup with LegoJS directives:

```html
<template>
  <h1>{{ title }}</h1>
  <p b-if="showContent">{{ content }}</p>
  <ul>
    <li b-for="item in items">{{ item }}</li>
  </ul>
</template>
```

### Script Section

Exports the component's reactive state and methods:

```html
<script>
export default {
  // Reactive properties
  title: 'Welcome',
  count: 0,
  items: ['apple', 'banana'],
  
  // Methods
  increment() {
    this.count++;
  },
  
  // Lifecycle hooks
  mounted() {
    console.log('Component mounted!');
  }
}
</script>
```

### Style Section

Scoped styles using Shadow DOM. Use `self` to target the component root:

```html
<style>
  self {
    display: block;
    padding: 1rem;
  }
  
  h1 {
    color: #333;
  }
  
  button {
    background: blue;
    color: white;
  }
</style>
```

Styles are automatically scoped to your component—they won't affect other components or global styles.

## Hot Module Replacement

During development, changes to `.lego` files trigger a full page reload. Your changes appear instantly!

```bash
npm run dev
```

Edit your component, save, and see the result immediately.

## Passing Props

Pass data to components via the `b-data` attribute:

```html
<user-card b-data="{ 
  name: 'Jane Smith', 
  bio: 'Designer', 
  followers: 5678 
}"></user-card>
```

Or define defaults in the script section and override as needed.

## Best Practices

### 1. Keep Components Small

Each `.lego` file should represent a single, focused component.

✅ Good: `user-avatar.lego`, `user-name.lego`, `user-bio.lego`  
❌ Bad: `entire-profile-page.lego`

### 2. Use Semantic Names

Name components after what they represent, not how they look:

✅ Good: `article-preview.lego`, `comment-list.lego`  
❌ Bad: `blue-box.lego`, `flex-container.lego`

### 3. Organize by Feature

```
components/
├── user/
│   ├── user-card.lego
│   ├── user-avatar.lego
│   └── user-profile.lego
├── posts/
│   ├── post-item.lego
│   └── post-list.lego
└── shared/
    ├── app-button.lego
    └── app-modal.lego
```

## Limitations

- `.lego` files require Vite—they don't work with direct `<script>` tag inclusion
- Each file creates exactly one component
- Component name is derived from filename (cannot be customized)

## Comparison: SFC vs Traditional

### Traditional (HTML Template)

```html
<template b-id="my-component">
  <style>self { padding: 1rem; }</style>
  <h1>{{ title }}</h1>
</template>

<my-component b-data="{ title: 'Hello' }"></my-component>
```

### SFC (.lego file)

```html
<!-- my-component.lego -->
<template>
  <h1>{{ title }}</h1>
</template>

<style>
  self { padding: 1rem; }
</style>

<script>
export default {
  title: 'Hello'
}
</script>
```

```html
<!-- index.html -->
<my-component></my-component>
```

Both work perfectly! Choose based on your project needs:
- **Small projects / prototypes** → HTML templates
- **Medium/large projects** → SFCs with Vite

## Next Steps

- See [complete SFC examples](/examples/sfc-showcase)
- Learn about the [Vite plugin API](/api/vite-plugin)
- Check out the [routing guide](/guide/routing) for building apps
