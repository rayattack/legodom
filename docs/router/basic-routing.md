# Basic Routing: The Global Outlet

Before we dive into surgical swaps, we must understand how LegoJS handles the initial entry into your application. Every application needs a primary gateway—a place where the main content lives. In Lego, this is the `<lego-router>`.

## The Entry Point

In your `index.html`, you define a single custom element that acts as the "Master Outlet":

```html
<body>
  <my-application-nav></my-application-nav>
  <lego-router></lego-router>
</body>

```


When the page loads, the LegoJS router looks at the current browser URL and searches its internal "Route Map" for a match.

## Defining Your First Routes

Routes are defined using the `Lego.route(path, componentName)` method. This creates a contract between a URL pattern and a Web Component.

```js
// Static Route
Lego.route('/', 'home-page');

// Dynamic Route (with parameters)
Lego.route('/user/:id', 'profile-page');

```

### How the Matching Works

1.  **The Match**: Lego uses Regex to compare the window location with your defined paths.
    
2.  **The Injection**: If a match is found, Lego creates an instance of the associated component (e.g., `<home-page>`) and injects it into the `<lego-router>` tag.
    
3.  **The Hydration**: The framework then "snaps" the component to life, initializing its state and running its `mounted()` lifecycle hook.
    

## The Global Fallback

If no route matches the current URL, LegoJS looks for a special fallback route. This is essential for handling **404 Not Found** states gracefully.

```js
Lego.route('*', 'not-found-page');

```

## Handling Parameters (`$params`)

When you use a dynamic path like `/user/:id`, Lego automatically parses the URL and makes the data available to the component via the `$params` object.

In your component template:

```html
<template b-id="profile-page">
  <h1>User Profile</h1>
  <p>Viewing ID: {{ $params.id }}</p>
</template>

```

In your component logic:

```js
mounted() {
  const userId = this.$params.id;
  this.fetchUserData(userId);
}

```

**or**


```html
<!-- profile-page.lego -->
<style>
  /* nothing here for now */
</style>

<template>
  <h1>User Profile</h1>
  <p>Viewing ID: {{ $params.id }}</p>
</template>

<script>
export default {
  mounted() {
    const userId = this.$params.id;
    this.fetchUserData(userId);
  }
}
</script>
```

## Summary

The `<lego-router>` is the foundation. It handles the "Big Swaps" of your application. However, in a modern "Enterprise" application, we rarely want to swap the _entire_ page content every time the URL changes.

In the next section, we will learn about **Surgical Swaps**, where we move beyond the global router and start updating specific pieces of the DOM using `b-target`.
