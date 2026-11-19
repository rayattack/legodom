---
layout: lesson
title: Methods
---

# Methods

Inline expressions are fine for one-liners. When the logic grows, move it into a method on the state object.

```js
export default {
  count: 0,
  add(amount) {
    this.count += amount;
  }
}
```

Inside a method, `this` is the block's state. Assign to it like any object and the page follows.

```html
<button @click="add(5)">+5</button>
```

## Your turn

1. Add an `add(amount)` method that increases `count`, but never past `limit`.
2. Add a `reset()` method.
3. Wire the three buttons to `add(1)`, `add(5)` and `reset()`.

`Math.min(a, b)` is a tidy way to enforce the limit.
