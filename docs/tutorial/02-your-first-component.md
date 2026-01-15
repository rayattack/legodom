# Step 2: Your First Component

Now let's create a component! By the end of this page, you'll understand the `.lego` file format and have a working home page.

## Create Your First `.lego` File

Create `src/components/home-page.lego`:

```html
<template>
  <div class="hero">
    <h1>[[ title ]]</h1>
    <p>[[ subtitle ]]</p>
    <button @click="handleClick()">[[ buttonText ]]</button>
  </div>
  
  <div class="features">
    <div class="feature" b-for="feature in features">
      <span class="icon">[[ feature.icon ]]</span>
      <h3>[[ feature.title ]]</h3>
      <p>[[ feature.description ]]</p>
    </div>
  </div>
</template>

<style>
  self {
    display: block;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 4rem 2rem;
  }
  
  .hero {
    text-align: center;
    max-width: 600px;
    margin: 0 auto 4rem;
  }
  
  .hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .hero p {
    font-size: 1.25rem;
    opacity: 0.9;
    margin-bottom: 2rem;
  }
  
  .hero button {
    background: white;
    color: #667eea;
    border: none;
    padding: 1rem 2.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .hero button:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
  }
  
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }
  
  .feature {
    background: rgba(255,255,255,0.1);
    padding: 2rem;
    border-radius: 16px;
    text-align: center;
    backdrop-filter: blur(10px);
  }
  
  .feature .icon {
    font-size: 3rem;
    display: block;
    margin-bottom: 1rem;
  }
  
  .feature h3 {
    margin-bottom: 0.5rem;
  }
  
  .feature p {
    opacity: 0.8;
    font-size: 0.9rem;
  }
</style>

<script>
export default {
  title: 'Welcome to My App',
  subtitle: 'Built with LegoDOM – the tiny framework that loves developers',
  buttonText: 'Get Started',
  
  features: [
    { icon: '⚡', title: 'Lightning Fast', description: 'No virtual DOM overhead' },
    { icon: '🧩', title: 'Component-Based', description: 'Reusable building blocks' },
    { icon: '🎨', title: 'Scoped Styles', description: 'CSS that never leaks' }
  ],
  
  handleClick() {
    // We'll wire this up to navigation soon!
    alert('Clicked! Next: we\'ll navigate to /login');
  },
  
  mounted() {
    console.log('Home page mounted!');
  }
}
</script>
```

## Understanding the Structure

Every `.lego` file has three sections:

### 1. `<template>` – Your HTML

```html
<template>
  <h1>[[ title ]]</h1>           <!-- Reactive text -->
  <button @click="doSomething()"> <!-- Event binding -->
  <div b-for="item in items">     <!-- Loop directive -->
</template>
```

### 2. `<style>` – Scoped CSS

```html
<style>
  self {
    /* 'self' targets the component root (like :host) */
    display: block;
  }
  
  button {
    /* These styles ONLY affect this component */
  }
</style>
```

### 3. `<script>` – Logic & State

```html
<script>
export default {
  // Reactive properties
  title: 'Hello',
  count: 0,
  items: [],
  
  // Methods
  doSomething() {
    this.count++;  // Mutation triggers re-render!
  },
  
  // Lifecycle
  mounted() {
    console.log('Component is ready');
  }
}
</script>
```

## Register the Route

Now update `src/app.js` to show your component:

```javascript{7-8}
import { Lego } from 'lego-dom';
import registerComponents from 'virtual:lego-components';

registerComponents();

// Add this line:
Lego.route('/', 'home-page');

await Lego.init();
```

## See It Live

```bash
npm run dev
```

Open `http://localhost:5173` and you'll see your beautiful home page!

## What You've Learned

✅ The three-section `.lego` file structure  
✅ Template syntax: `[[ ]]` for data, `@click` for events, `b-for` for loops  
✅ The `self` keyword for component root styling  
✅ How to export state and methods from `<script>`  
✅ Connecting a component to a route  

## Key Pattern: Component → Route → Display

```
home-page.lego  →  Lego.route('/', 'home-page')  →  <lego-router> shows it
```

The filename (minus `.lego`) becomes the component name. Routes map URLs to component names. The router displays the matched component.

---

<div style="display: flex; justify-content: space-between; margin-top: 3rem;">
  <a href="./01-project-setup" style="display: inline-block; background: #eee; color: #333; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    ← Previous: Project Setup
  </a>
  <a href="./03-adding-routes" style="display: inline-block; background: #4CAF50; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
    Next: Adding Routes →
  </a>
</div>
