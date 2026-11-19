---
layout: lesson
title: Shared state
---

# Shared state

Some state belongs to the whole app: the signed-in user, the theme, a cart. Passing it through every block as a prop gets old quickly.

`Lego.globals` is a reactive object every block can reach. Set it up before the app starts, in `app.js`:

```js
Lego.globals.cart = { items: 0 };
```

Templates read it as `global`:

```html
<span>[[ global.cart.items ]] in cart</span>
```

Only the bindings that read a global re-run when it changes. In a method, write through `Lego.globals`.

## Your turn

`app.js` already creates `Lego.globals.cart`.

1. In `cart-badge.lego`, show `global.cart.items`.
2. In `add-button.lego`, make `add()` increase `Lego.globals.cart.items`.

The two blocks are siblings with no link between them, and both stay in step.
