# SFC Showcase

Using `.lego` files with Vite.

## File Structure

**Counter.lego**
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
import './Counter.lego';
```

**index.html**
```html
<counter-component></counter-component>
```
