# Lego.init()

Initializes the LegoDOM application on a root element. This method must be called to start the framework, set up observers, and render the initial state.

## Signature

```js
Lego.init(root, options)
```

## Parameters

### `root`
- **Type**: `HTMLElement`
- **Default**: `document.body`
- **Description**: The root element to manage. LegoDOM will observe this element and all its children.

### `options`
- **Type**: `Object`
- **Default**: `{}`
- **Properties**:
  - `styles` (Object): A map of style keys to arrays of stylesheet URLs. Used for `b-stylesheets`.
  - `loader` (Function): A hook to dynamically load blocks (SFBs) when an unknown tag is encountered.
  - `studio` (Boolean): If `true`, enables the Lego Studio integration.

## Examples

### Basic Usage

```js
Lego.init(document.body, {
  styles: {
    // Array of stylesheets supported!
    'main-theme': ['/assets/reset.css', '/assets/theme.css']
  },
  loader: (tagName) => fetch(`/blocks/${tagName}.lego`).then(r => r.text())
});
```

### Advanced Loader Strategy

You can use the `loader` hook to implement smart routing for your blocks, loading them from different directories based on their naming convention.

```js
Lego.init(document.body, {
  loader: (tagName) => {
    // 1. Ignore standard HTML elements or specific prefixes
    if (!tagName.includes('-')) return null;
    
    // 2. Route 'ui-*' blocks to the widgets folder
    if (tagName.startsWith('ui-')) {
      return fetch(`/widgets/${tagName}.lego`).then(res => {
        if (!res.ok) throw new Error('Widget not found');
        return res.text();
      });
    }

    // 3. Route everything else to blocks
    return fetch(`/blocks/${tagName}.lego`).then(res => res.text());
  }
});
```
