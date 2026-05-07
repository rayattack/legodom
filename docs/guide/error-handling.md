# Error Handling

LegoDOM provides hierarchical error boundaries that catch errors in rendering, lifecycle hooks, and event handlers — then display a fallback block instead of crashing the entire page.

::: tip Coming from React or Svelte?
| React | Svelte | LegoDOM |
|-------|--------|---------|
| `<ErrorBoundary>` component | `{#await}` / try-catch | `b-error` attribute |
| `componentDidCatch()` | No built-in | Automatic hierarchical bubbling |
| `error` state in boundary | Error in catch block | `$error` object injected into fallback |

LegoDOM's approach is closer to React's Error Boundaries, but simpler — you just add a `b-error` attribute instead of writing a wrapper class.
:::

## The `b-error` Attribute

Add `b-error` to any block to define which fallback block should render when an error occurs. It can be set at two levels:

### Template-Level (Default for All Instances)

```html
<!-- All instances of user-dashboard use this error boundary -->
<template b-id="user-dashboard" b-error="error-card">
  <user-profile></user-profile>
  <activity-feed></activity-feed>
</template>
```

### Instance-Level (Override)

```html
<!-- This specific instance uses a different fallback -->
<user-dashboard b-error="critical-error"></user-dashboard>
```

Instance-level `b-error` takes priority over template-level.

## Creating an Error Fallback Block

The error fallback block receives a `$error` object with details about the crash:

```html
<!-- error-card.lego -->
<template>
  <div class="error-card">
    <h3>Something went wrong</h3>
    <p>[[ $error.message ]]</p>
    <p class="component">Failed in: [[ $error.component ]]</p>
    <button @click="location.reload()">Reload Page</button>
  </div>
</template>

<style>
  .error-card {
    padding: 1.5rem;
    background: #fee;
    border: 1px solid #c33;
    border-radius: 8px;
  }
  .component {
    color: #666;
    font-size: 0.85rem;
  }
</style>
```

### The `$error` Object

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | The error message |
| `stack` | `string` | The full stack trace |
| `component` | `string` | Tag name of the block that crashed (e.g., `"user-profile"`) |

Access `$error` in three ways:

```html
<!-- 1. In templates -->
<p>[[ $error.message ]]</p>

<!-- 2. In script logic -->
<script>
export default {
  mounted() {
    console.log('Crashed block:', this.$error.component);
  }
}
</script>
```

```js
// 3. From outside the block
const errorCard = document.querySelector('error-card');
console.log(errorCard.state.$error.message);
```

## How Error Bubbling Works

When a block crashes, LegoDOM walks up the DOM tree looking for the nearest `b-error` boundary:

```
app-shell (b-error="global-error")
├── header-bar
│   └── (error here → bubbles up to app-shell → shows global-error)
├── user-dashboard (b-error="dashboard-error")
│   ├── user-profile
│   │   └── (error here → bubbles up to user-dashboard → shows dashboard-error)
│   └── activity-feed
│       └── (error here → bubbles up to user-dashboard → shows dashboard-error)
└── sidebar-panel
    └── (error here → bubbles up to app-shell → shows global-error)
```

Key rules:

- **Instance-level checked first**, then template-level at each ancestor.
- **Crosses Shadow DOM boundaries** — errors bubble through shadow roots.
- **Self-reference prevention** — a `b-error` whose target tag equals the crashing block's tag is skipped, so the boundary can't relaunch the same crashing block.
- **Recursion limit** — each boundary tracks recovery depth and refuses to re-render its fallback more than 3 times deep. If the fallback itself is consistently broken, the runtime gives up and routes to `Lego.config.onError`.

## What Gets Caught

Error boundaries catch errors in:

- **Rendering** — template expression evaluation (`[[ badExpression ]]`) and directive execution.
- **Lifecycle hooks** — `mounted()` and `unmounted()`.
- **Event handlers** — `@click`, `@input`, and the rest.

Errors that escape the rendering pipeline (a `setTimeout` callback throwing, a fetch promise rejection, a manually attached `addEventListener` handler) are **not** caught by `b-error` — handle those yourself, typically by routing to `Lego.config.onError`.

## Global error handler

If no `b-error` boundary is found anywhere in the ancestor chain, the runtime falls back to `Lego.config.onError`:

```js
Lego.config.onError = (err, type, el) => {
  console.error(`[Lego] [${type}]`, err, el);
  Sentry.captureException(err, { tags: { lego_type: type, tag: el?.tagName } });
};
```

`Lego.init({ onError })` is **not** an option — set the handler on `Lego.config` directly, before or after `Lego.init`.

The `type` argument tells you where the error happened:

| `type` | Source |
|---|---|
| `'render'` | Template/binding evaluation |
| `'event-handler'` | An `@event="…"` handler |
| `'mounted'` / `'unmounted'` | Lifecycle hooks |
| `'sync-update'` | A `b-sync` write |
| `'define'` | `Lego.block()` registration |
| `'script'` | `<script>` evaluation in a `.lego` file |
| `'quota'` / `'quota-critical'` | `$db` storage exhaustion |

## Complete Example

Here's a full error boundary setup:

**1. Define the error fallback:**

```html
<!-- error-fallback.lego -->
<template>
  <div class="error">
    <h3>Oops! Something broke.</h3>
    <p>[[ $error.message ]]</p>
    <details>
      <summary>Technical Details</summary>
      <p>Component: [[ $error.component ]]</p>
      <pre>[[ $error.stack ]]</pre>
    </details>
    <button @click="$emit('retry')">Try Again</button>
  </div>
</template>

<style>
  .error {
    padding: 2rem;
    background: #fff3f3;
    border: 1px solid #e55;
    border-radius: 8px;
    text-align: center;
  }
  details { text-align: left; margin-top: 1rem; }
  pre { overflow-x: auto; font-size: 0.8rem; background: #f5f5f5; padding: 1rem; }
</style>
```

**2. Use it in your app:**

```html
<!-- app-shell.lego -->
<template b-error="error-fallback">
  <header>
    <nav-bar></nav-bar>
  </header>

  <main>
    <!-- Dashboard has its own boundary for more specific handling -->
    <user-dashboard b-error="dashboard-error"></user-dashboard>

    <!-- Sidebar uses the parent's boundary (error-fallback) -->
    <sidebar-panel></sidebar-panel>
  </main>
</template>
```

**3. Set up a global fallback in your entry file:**

```js
Lego.config.onError = (err, type, el) => {
  // Last resort — log errors that no boundary caught
  console.error(`Uncaught [${type}] in <${el?.tagName?.toLowerCase()}>:`, err);
};

Lego.init();
```

## Best Practices

### Place a Global Boundary at the App Root

```html
<template b-id="app-root" b-error="app-error">
  <slot></slot>
</template>
```

This ensures no error goes completely unhandled.

### Use Specific Boundaries for Critical Features

```html
<checkout-flow b-error="payment-error">
  <payment-form></payment-form>
</checkout-flow>

<user-settings b-error="settings-error">
  <preferences-panel></preferences-panel>
</user-settings>
```

Different error fallbacks can show different recovery options — a payment error might show "Contact Support", while a settings error might show "Reset to Defaults".

### Don't Over-Isolate

```html
<!-- Too granular — each card gets its own boundary -->
<user-card b-error="card-error"></user-card>
<user-card b-error="card-error"></user-card>
<user-card b-error="card-error"></user-card>

<!-- Better — one boundary for the container -->
<card-list b-error="card-error">
  <user-card></user-card>
  <user-card></user-card>
  <user-card></user-card>
</card-list>
```

### Keep Error Blocks Simple

Error fallback blocks should be as simple as possible to avoid errors within the error handler itself. If the error block itself crashes, LegoDOM falls back to `console.error`.

## Using with Lego.block()

When creating blocks programmatically, pass the error boundary as the 6th parameter:

```js
Lego.block(
  'my-widget',     // 1. tag name
  '<p>Hello</p>',  // 2. template HTML
  { count: 0 },    // 3. logic
  '',               // 4. stylesheets
  '',               // 5. cascade
  'error-fallback'  // 6. error boundary tag name
);
```

## Next Steps

- See [Authentication](/guide/authentication) for auth-related error patterns
- Learn about [Lifecycle Hooks](/guide/lifecycle) where errors are caught
- Explore [Directives](/guide/directives#b-error) for the full `b-error` reference
