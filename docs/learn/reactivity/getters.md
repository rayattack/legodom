---
layout: lesson
title: Derived values
---

# Derived values

Some values are worked out from others: a total, a filtered list, a full name. Write those as JavaScript getters.

```js
export default {
  price: 4,
  quantity: 3,
  get total() {
    return this.price * this.quantity;
  }
}
```

Use it in the template like any other value: `[[ total ]]`.

A getter is cached. It runs again only when something it actually read has changed, and you never list its dependencies. Reading `this.price` is what subscribes it to `price`.

## Your turn

The cart shows `0` for everything.

1. Add a `subtotal` getter: `price * quantity`.
2. Add a `shipping` getter: free when the subtotal is `20` or more, otherwise `4`.
3. Add a `total` getter that adds the two, and show all three in the template.

Press the quantity buttons and watch shipping drop to zero.
