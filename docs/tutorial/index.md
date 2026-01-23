# LegoDOM is Simple to Learn

```html
<style>
  self {}
  button { background-color: #000; color: #fff; padding: 5px 10px; }
</style>

<template b-stylesheets="bulma">
  <input type="text" b-sync="name">
  <button @click="greet">[[ count > 0 ? `Greeted ${count} times` : 'Greet' ]]</button>
  <h1>Hello [[ name ]]! You are on the [[ $route.url ]] page.</h1>
</template>

<script>
  export default {
    count: 0,
    name: $db('username').default('World'),
    greet() {
      alert('Hello ' + this.name + '!');

      //let's send it up the lego chain
      this.$emit('greet', this.name);
    }
  }
</script>
```

Welcome! In the next 15 minutes, you'll build a complete multi-page application with beautiful blocks, smooth navigation, and a login flow. No prior framework experience needed.


## What You'll Build

A polished app with:
- 🏠 **Landing Page** – Your app's front door
- 🔐 **Login Page** – A form that validates and navigates
- 🎉 **Welcome Page** – Personalized dashboard after login

All using Single File Blocks (`.lego` files) and client-side routing.

## Prerequisites

- Node.js 18+ installed
- A code editor (VS Code recommended)
- Basic HTML/CSS/JavaScript knowledge

## Tutorial Path

| Step | You'll Learn |
|------|--------------|
| [1. Project Setup](./01-project-setup) | Create a new project with Vite |
| [2. Your First Block](./02-your-first-block) | Build a `.lego` file |
| [3. Adding Routes](./03-adding-routes) | Navigate between pages |
| [4. Multi-Page App](./04-multi-page-app) | Complete login flow |
| [5. State & Globals](./05-state-and-globals) | Share data across pages |

## Ready?

<div style="text-align: center; margin: 2rem 0;">
  <a href="./01-project-setup" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1.2rem;">
    Start Building →
  </a>
</div>

::: tip No Build Tools? No Problem!
If you want to skip the Vite setup and use LegoDOM via CDN, check out the [CDN Quick Start](/guide/cdn-usage). You can always come back to this tutorial later.
:::
