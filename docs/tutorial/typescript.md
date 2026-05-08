# TypeScript Support

LegoDOM is fully typed and ready for enterprise-scale applications. Whether you are using the core library API or writing Single File Blocks, we have you covered.

## 1. Type Definitions

When you install LegoDOM via NPM, you get full TypeScript definitions out of the box. You don't need `b-@types/lego-dom`.

```bash
npm install lego-dom
```

In your code, `Lego` will be fully typed:

```typescript
import { Lego } from 'lego-dom';

// TS provides autocomplete and validation here
Lego.init(document.body, { debug: true });
```

## 2. Using TypeScript in `.lego` Files

If you are using the **Vite Plugin**, you can use TypeScript directly inside your blocks.

Simply add `lang="ts"` to your script tag:

```html
<template>
  <h1>[[ title ]]</h1>
  <button @click="increment">Count: [[ count ]]</button>
</template>

<script lang="ts">
interface State {
  title: string;
  count: number;
}

export default {
  title: 'Hello Type Safety',
  count: 0,
  
  increment() {
    // TypeScript knows 'this' context if you define it, 
    // or you can use standard object methods
    this.count++;
  }
}
</script>
```

### Configuration
Ensure your `tsconfig.json` includes `.lego` files or you use the VS Code extension to suppress warnings.

## 3. VS Code Extension

For the best experience, install the [LegoDOM VS Code Extension](#) (Coming Soon to Marketplace). It provides:
- Syntax Highlighting for `.lego` files
- Code Snippets
- HTML/CSS Intelligence

For now, you can install it manually from the `extensions/vscode` folder in the repo.

## 4. JSDoc Support (Vanilla JS)

If you prefer not to use a build step, LegoDOM's source code works great with JSDoc.

```javascript
/**
 * @type {import('lego-dom').LegoConfig}
 */
const config = {
  debug: true
};
```
