# Global Configuration

`Lego.config` allows you to customize framework behavior, including error handling and metrics.

## Properties

### `syntax`

*   **Type**: `'mustache' | 'brackets'`
*   **Default**: `'brackets'`

Configures the template delimiter style.

*   `'brackets'`: Uses <code v-pre>[[ variable ]]</code> (Default)
*   `'mustache'`: Uses <code v-pre>{{ variable }}</code> (Legacy/Vue-style)

```javascript
// Switch back to mustache syntax if preferred
Lego.config.syntax = 'mustache';
```

### `loader`

*   **Type**: `(tagName: string) => string | Promise<string> | null`
*   **Default**: `undefined`

Use this hook to implement **Server-Side Component Delivery**.

**Option 1: Simple Mode (Return URL)**
We fetch it for you.
```javascript
loader: (tag) => `/components/${tag}.lego`
```

**Option 2: Power Mode (Return Promise)**
You control the fetch. Useful for **Authentication** (Cookies, JWT) or Custom Headers.

```javascript
Lego.init(document.body, {
  loader: async (tagName) => {
    // Custom Authenticated Fetch
    const res = await fetch(`/components/${tagName}.lego`, {
      credentials: 'include', // Send Cookies
      headers: { 'Authorization': getToken() }
    });
    return await res.text(); // Return SFC content directly
  }
});
```
**Mechanism:**
1. Browser sees unknown `<admin-widget>`.
2. `Lego` calls `config.loader('admin-widget')`.
3. If URL returned, it fetches the file.
4. The server returns raw SFC content (`<template>...`).
5. `Lego.defineSFC()` parses and upgrades the element instantly.

### `onError`

*   **Type**: `(error: Error, type: string, context: HTMLElement) => void`
*   **Default**: `undefined`

Global error handler hook. Called when an error occurs during:
*   `render`: Template rendering (expression evaluation)
*   `event-handler`: `@event` callbacks
*   `define`: Component definition
*   `sync-update`: `b-sync` updates

```javascript
Lego.config.onError = (err, type, context) => {
  console.error(`Error in ${type}:`, err);
  // Send to Sentry/Datadog
  captureException(err, { tags: { type } });
};
```

### `metrics`

*   **Type**: `Object`

Performance monitoring hooks, primarily used by plugins.

*   `onRenderStart(el)`: Called before a component renders.
*   `onRenderEnd(el)`: Called after a component finishes rendering.

```javascript
// Example monitoring implementation
Lego.config.metrics = {
  onRenderStart(el) {
    console.time(el.tagName);
  },
  onRenderEnd(el) {
    console.timeEnd(el.tagName);
  }
};
```
