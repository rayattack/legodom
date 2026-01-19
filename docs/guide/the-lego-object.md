# The Lego Object

The `Lego` global object is the control center of your application. It is responsible for starting the engine, observing the DOM for changes, and managing global state.

Unlike other frameworks that require you to mount an "App" to a specific div, LegoDOM works more like a browser enhancement. You initialize it, and it watches the entire page (or a specific root) for custom tags.

## The Heartbeat: `Lego.init()`

This is the most important method. Without it, LegoDOM receives no life.

```js
Lego.init(root = document.body, options = {});
```

When you call `init`, LegoDOM does three critical things:

1.  **Starts the MutationObserver**: It begins watching the DOM for any new elements that match your registered blocks. If you insert a `<user-card>` via innerHTML or `document.createElement`, LegoDOM detects it and "snaps" it to life immediately.
2.  **Binds Global State**: It ensures `Lego.globals` is reactive and linked to the DOM.
3.  **Starts the Render Loop**: It initializes the update batcher that efficiently re-renders blocks when state changes.

### Options

-   `styles`: A map of shared stylesheets (see [Styling](/guide/blocks#styling-the-host)).
-   `loader`: An async function to dynamically fetch and compile blocks that haven't been loaded yet.
-   `studio`: Enables the visual development environment.

## The Registry: `Lego.block()`

There is no "Lego Block" base class you extends. Instead, you **define** the relationship between a Tag Name and its Logic.

```js
Lego.block('user-card', template, logic, styles);
```

-   **Tag Name**: Must have a hyphen (e.g., `my-widget`).
-   **Template**: The HTML string.
-   **Logic**: The state and methods object.
-   **Styles**: Space-separated keys of shared stylesheets to apply.

> **Note**: `Lego.define()` is also available as an alias for backward compatibility.

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
