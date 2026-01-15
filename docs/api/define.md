# Lego.define()

Defining components in JavaScript.

## Type Signature

```ts
Lego.define(tagName: string, template: string, state?: object)
```

## Arguments

- **tagName**: The name of the custom element (must contain a hyphen).
- **template**: The HTML string for the component. Can include `<style>`, markup, and bindings.
- **state**: Initial state object and methods.

## Example

```js
import { Lego } from 'lego-dom';

Lego.define('user-card', `
  <div class="card">
    <h3>[[ name ]]</h3>
    <p>[[ role ]]</p>
  </div>
`, {
  name: 'John Doe',
  role: 'Admin'
});
```

## Lego.defineSFC()

Runtime parser for Single File Components (SFC). Useful for **Server-Side Rendering** or dynamic loading architectures.

```ts
Lego.defineSFC(content: string, filename?: string)
```

### Example

```javascript
const sfc = `
<template>
  <h1>[[ title ]]</h1>
</template>
<script>
  export default { title: 'Hello World' }
</script>
<style>
  h1 { color: red; }
</style>
`;

// Registers <my-component> instantly
Lego.defineSFC(sfc, 'my-component.lego');
```
