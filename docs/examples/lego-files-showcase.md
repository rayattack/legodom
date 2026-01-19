# SFC Showcase

Using `.lego` files with Vite.

## File Structure

**block-counter.lego**
```html
<template>
  <button @click="count++">Count: [[ count ]]</button>
</template>

<style>
  button { color: red; }
</style>

<script>
  export default {
    count: 0
  }
</script>
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
