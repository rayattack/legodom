# Lego.block()

Defining blocks in JavaScript.

## Type Signature

```ts
Lego.block(tagName: string, template: string, logic?: object, styles?: string)
```

> **Note:** `Lego.define()` is available as an alias for backward compatibility.

## Arguments

- **tagName**: The name of the custom element (must contain a hyphen).
- **template**: The HTML string for the block. Can include `<style>`, markup, and bindings.
- **logic**: Initial state object and methods.
- **styles**: Space-separated list of stylesheet keys (e.g. `'main theme'`) referring to stylesheets registered in `Lego.init`.

## Example

```js
import { Lego } from 'lego-dom';

Lego.block('user-card', `
  <div class="card">
    <h3>[[ name ]]</h3>
    <p>[[ role ]]</p>
  </div>
`, {
  name: 'John Doe',
  role: 'Admin'
});
```

## Lego.defineLegoFile()

Runtime parser for Single File Blocks (SFB). Useful for **Server-Side Rendering** or dynamic loading architectures.

```ts
Lego.defineLegoFile(content: string, filename?: string)
```

### Example

```js
// Registers <my-block> instantly
Lego.defineLegoFile(sfc, 'my-block.lego');
```
