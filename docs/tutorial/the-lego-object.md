# The Lego Object

The `Lego` global object is the control center of your application. It is responsible for starting the engine, observing the DOM for changes, and managing global state.

Unlike other frameworks that require you to mount an "App" to a specific div, LegoDOM works more like a browser enhancement. You initialize it, and it watches the entire page (or a specific root) for custom tags.

## The Heartbeat: `Lego.init()`

This is the most important method. Without it, LegoDOM receives no life.

```js
Lego.init(root = document.body, options = {});
```

When you call `init`, LegoDOM does three critical things:

1.  **Registers Blocks**: It ensures all blocks are registered as Custom Elements so the browser can detect them.
2.  **Binds Global State**: It ensures `Lego.globals` is reactive and linked to the DOM.
3.  **Starts the Render Loop**: It initializes the update batcher that efficiently re-renders blocks when state changes.

### Options

-   `styles`: A map of shared stylesheets (see [Styling](/tutorial/blocks#styling-the-host)).
-   `manifest`: A configuration for pre-registering blocks (see [Manifest Syntax](#manifest-syntax) below).
-   `loader`: An async function to dynamically fetch blocks NOT in the manifest.
-   `studio`: Enables the visual development environment.

### Manifest Syntax

The `manifest` option powers the lazy-loading of "Server Blocks". It accepts 3 formats:

#### 1. Group Array (Recommended)
Best for mixing multiple sources (e.g. backend API + static files).

```js
manifest: [
  // Group 1: Backend API (No extension)
  // Fetches: /api/blocks/user-widget
  {
    base: '/api/blocks/',
    legos: ['user-widget', 'data-table'] 
  },
  
  // Group 2: Static Files (With .lego extension)
  // Fetches: /assets/nav-bar.lego
  {
    base: '/assets/',
    suffix: true, 
    legos: ['nav-bar', 'footer'] 
  },

  // Group 3: Secure Mappings
  {
    credentials: 'include', 
    headers: { 
      'Authorization': () => `Bearer ${Lego.globals.token}`, // Dynamic Function
      'X-Session': '$globals.sessionId' // Memory Lookup
    },
    map: {
      'server-time': 'POST:/api/time' 
    }
  }
]
```

#### 2. Single Object (Protected Manifest)

```js
manifest: {
  url: '/secure-manifest.json',
  // Credentials are favored over token headers for security
  credentials: 'include' 
}
```

> [!CAUTION]
> **Security Warning**: Avoid storing sensitive tokens in LocalStorage (`$db`). Any script on the page can access them. Prefer `credentials: 'include'` (HttpOnly Cookies) which are invisible to JavaScript, or store short-lived tokens in memory (`$globals`).


#### 3. Remote JSON
Keep your bundle small by loading the config from a file.

```js
manifest: '/lego.manifest.json'
```

**Properties:**
- `base`: (String) URL prefix. Defaults to `""`.
- `suffix`: (Boolean | String) Extention to append. `true` adds `.lego`.
- `legos`: (Array&lt;String&gt;) List of tag names to generate URLs for.
- `map`: (Object) Explicit `tag: url` pairs.
- `headers`: (Object) Dynamic headers (`Function`, `$globals.key`).
- `credentials`: (String) Fetch mode (`include`, `omit`, `same-origin`).


## The Registry: `Lego.block()`

There is no "Lego Block" base class you extends. Instead, you **define** the relationship between a Tag Name and its Logic.

```js
Lego.block('user-card', template, logic, styles);
```

-   **Tag Name**: Must have a hyphen (e.g., `my-widget`).
-   **Template**: The HTML string.
-   **Logic**: The state and methods object.
-   **Styles**: Space-separated keys of shared stylesheets to apply.

> **Note**: `Lego.block()` is also available as an alias for backward compatibility.

## Global State: `Lego.globals`

LegoDOM provides a built-in global store that is deeply reactive.

```js
Lego.globals.theme = 'dark';
Lego.globals.user = { name: 'Alice' };
```

Any block that uses `[[ global.theme ]]` in its template will automatically re-render when this value changes. You don't need providers, context, or reducers. Just direct assignment.

## Configuration: `Lego.config`

You can tap into the internal behavior of the framework for error handling.

```js
Lego.config.onError = (error, type, blockName) => {
  console.error(`Error in ${blockName} (${type}):`, error);
  // Send to Sentry/logging service
};
```

This catches errors in:
- Block lifecycle hooks (`mounted`, `updated`, `unmounted`)
- Event handlers (`@click`, etc.)
- Block definitions

## Timing and Reactivity Helpers

- **`Lego.nextTick()`** resolves after the next render flush has committed its DOM writes. Use it in tests and in code that needs to measure the DOM after a state change.
- **`Lego.effect(fn)`** runs `fn` now and again whenever any reactive value it read changes. Returns a stop function. Useful against `Lego.globals` outside any block.
- **`Lego.watch(source, cb, options?)`** calls `cb(newValue, oldValue)` when a global changes. `source` is a dotted path into `Lego.globals` or a function receiving it. Inside a block, use `this.$watch` instead.

## Multiple Apps: `Lego.createApp()`

`Lego` itself is an app. `Lego.createApp({ config, globals })` makes another one with its own config (delimiters, `strict`, `onError`, `sanitize`, `loader`), its own globals, its own routes, and its own plugins via `app.use(plugin)`. Two apps can share a page as long as they define different tag names, because custom element names are global to the document. See [Lego.createApp()](/api/create-app).

## Sharing Definitions with the Server

`Lego.block()` no longer touches the DOM at registration, so a module of block definitions can be imported in Node. `Lego.getDefinitions()` returns them in the shape the server renderer accepts, so one registration serves both `renderToString` on the server and hydration in the browser. See [Server-Side Rendering](/tutorial/ssr).

## Developer Tools

LegoDOM exposes a few methods useful for debugging or building tools (like the Lego Studio):

### `Lego.getLegos()`
Returns an array of all registered block tag names.

```js
console.log(Lego.getLegos()); // ['user-card', 'nav-bar', ...]
```

### `Lego.getActiveBlocksCount()`
Returns the number of live block instances currently in the DOM. useful for detecting memory leaks.

```js
setInterval(() => {
  console.log('Active blocks:', Lego.getActiveBlocksCount());
}, 1000);
```

## Manual Control

For advanced manual DOM manipulation (e.g. testing libraries or strict integrations), you can manually manage block lifecycles:

-   **`Lego.snap(element)`**: Manually initialize a block on an existing element.
-   **`Lego.unsnap(element)`**: Manually destroy a block and clean up its listeners.

See [Advanced API](/api/advanced) for details.
