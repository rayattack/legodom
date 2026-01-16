# CDN Usage

Lego works perfectly without any build tools. Just include it via CDN and start building!

## Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <!-- Define your component -->
  <template b-id="hello-world">
    <h1>[[ message ]]</h1>
  </template>
  
  <!-- Use it -->
  <hello-world b-data="{ message: 'Hello from CDN!' }"></hello-world>
  
  <!-- Include Lego -->
  <script src="https://unpkg.com/lego-dom/main.js"></script>
  <script>
    Lego.init();
  </script>
</body>
</html>
```

That's it! Open this file in any browser and it works.

## CDN Providers

### unpkg (Recommended)

```html
<!-- Latest version -->
<script src="https://unpkg.com/lego-dom/main.js"></script>

<!-- Specific version -->
<script src="https://unpkg.com/lego-dom@1.3.4/main.js"></script>
```

### jsdelivr

```html
<!-- Latest version -->
<script src="https://cdn.jsdelivr.net/npm/lego-dom/main.js"></script>

<!-- Specific version -->
<script src="https://cdn.jsdelivr.net/npm/lego-dom@1.3.4/main.js"></script>
```



## Complete Example

Here's a full working application using only CDN:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo App - Lego</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 600px;
      margin: 2rem auto;
      padding: 0 1rem;
    }
  </style>
</head>
<body>
  <h1>My Todo App</h1>
  <todo-app></todo-app>

  <template b-id="todo-app">
    <style>
      self {
        display: block;
      }
      .input-group {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      input {
        flex: 1;
        padding: 0.5rem;
        font-size: 1rem;
      }
      button {
        padding: 0.5rem 1rem;
        font-size: 1rem;
        background: #4CAF50;
        color: white;
        border: none;
        cursor: pointer;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        padding: 0.75rem;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .done {
        text-decoration: line-through;
        opacity: 0.6;
      }
    </style>
    
    <div class="input-group">
      <input 
        b-sync="newTodo" 
        placeholder="What needs to be done?"
        @keyup="event.key === 'Enter' && addTodo()">
      <button @click="addTodo()">Add</button>
    </div>
    
    <ul>
      <li b-for="todo in todos">
        <input type="checkbox" b-sync="todo.done">
        <span class="[[ todo.done ? 'done' : '' ]]">
          [[ todo.text ]]
        </span>
      </li>
    </ul>
    
    <p>[[ remaining() ]] remaining</p>
  </template>

  <script src="https://unpkg.com/lego-dom/main.js"></script>
  
  <script>
    // Initialize with data
    Lego.define('todo-app', Lego.registry['todo-app'].innerHTML, {
      newTodo: '',
      todos: [
        { text: 'Learn Lego', done: true },
        { text: 'Build something awesome', done: false }
      ],
      addTodo() {
        if (this.newTodo.trim()) {
          this.todos.push({
            text: this.newTodo,
            done: false
          });
          this.newTodo = '';
        }
      },
      remaining() {
        return this.todos.filter(t => !t.done).length;
      }
    });

    // Don't forget to init!
    Lego.init();
  </script>
</body>
</html>
```

## Progressive Enhancement

Lego is perfect for progressively enhancing existing sites:

```html
<!-- Your existing page -->
<div id="legacy-content">
  <h1>My Existing Site</h1>
  <p>This works without JavaScript</p>
</div>

<!-- Add interactive components -->
<user-widget></user-widget>

<template b-id="user-widget">
  <style>
    self {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      background: white;
      padding: 1rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
  </style>
  <p>Welcome, [[ username ]]!</p>
  <button @click="logout()">Logout</button>
</template>

<script src="https://unpkg.com/lego-dom/main.js"></script>
<script>
  Lego.define('user-widget', Lego.registry['user-widget'].innerHTML, {
    username: 'Guest',
    async mounted() {
      const user = await fetch('/api/user').then(r => r.json());
      this.username = user.name;
    },
    logout() {
      window.location.href = '/logout';
    }
  });

  Lego.init();
</script>
```

## Embedding in Existing Apps

Lego components work alongside other frameworks:

```html
<!-- Works fine with jQuery, Bootstrap, etc. -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="https://unpkg.com/lego-dom/main.js"></script>

<!-- Your Lego component -->
<my-component></my-component>

<!-- Your jQuery code -->
<script>
  $(document).ready(function() {
    // jQuery code here
  });
</script>
```

## Loading Strategy

### For Production

Always pin to a specific version:

```html
<script src="https://unpkg.com/lego-dom@1.3.4/main.js"></script>
```

### For Development/Prototyping

Use latest:

```html
<script src="https://unpkg.com/lego-dom/main.js"></script>
```

### With defer

Load asynchronously without blocking page render:

```html
<script defer src="https://unpkg.com/lego-dom/main.js"></script>
```

### With integrity (SRI)

For maximum security:

```html
<script 
  src="https://unpkg.com/lego-dom@1.3.4/main.js"
  integrity="sha384-..."
  crossorigin="anonymous">
</script>
```

## Browser Compatibility

Lego works in all modern browsers:

- ✅ Chrome 63+
- ✅ Firefox 63+
- ✅ Safari 11.1+
- ✅ Edge 79+

No polyfills needed for these browsers!

## Using .lego Files without Build Tools

You can use full Single File Components (`.lego` files) directly in the browser without any build step! 
Lego provides a `loader` configuration that lets you fetch component files on demand.

### How it Works

1. **Serve your files**: Make sure your `.lego` files are accessible via HTTP (e.g., in a `/components` folder).
2. **Configure the loader**: Tell Lego how to fetch a component when it encounters an unknown tag.

### Example

```html
<script>
  Lego.init(document.body, {
    // The loader function receives the tag name (e.g., 'user-card')
    // and must return a Promise that resolves to the component's source code.
    loader: (tagName) => {
      // Fetch the raw text content of the .lego file
      return fetch(`/components/${tagName}.lego`).then(res => res.text());
    }
  });
</script>

<!-- Now just use the tag! Lego will fetch, compile, and render it automatically. -->
<user-card></user-card>
```

This is perfect for:
- **Micro-frontends**: Load components from different services.
- **CMS Integration**: Store component code in a database.
- **Dynamic Apps**: Load features only when they are needed.

## Pros and Cons

### Advantages

- **No build step** - Instant development
- **No npm** - No dependency management
- **Fast prototyping** - Perfect for demos and learning
- **Progressive enhancement** - Add to existing sites easily
- **Low barrier** - Great for beginners

### Limitations

- No hot module replacement
- Slower for large apps compared to bundled versions

## When to Use CDN

**Perfect for:**
- Prototypes and demos
- Small websites (1-5 components)
- Progressive enhancement
- Learning and experimentation
- CodePen/JSFiddle examples

**Consider bundling for:**
- Large applications (10+ components)
- Production apps requiring optimization
- Projects needing TypeScript
- Teams wanting SFC workflow

## Next Steps

- See [complete CDN examples](/examples/)
- Learn about [routing](/guide/routing) for multi-page apps
- Explore [directives](/guide/directives) for common patterns
