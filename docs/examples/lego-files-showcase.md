# SFC Showcase

Using `.lego` files with Vite.

## File Structure

**block-counter.lego**
```html
<script>
  export default {
    count: 0
  }
</script>

<template>
  <button @click="count++">Count: [[ count ]]</button>
</template>

<style>
  button { color: red; }
</style>
```

## Usage

**main.js**
```js
import './block-counter.lego';
```

**index.html**
```html
<block-counter></block-counter>
```
