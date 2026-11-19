---
layout: lesson
title: Expressions
---

# Expressions

The brackets hold more than a name. Anything that is a JavaScript expression works: arithmetic, ternaries, method calls.

```html
<p>[[ price * quantity ]]</p>
<p>[[ quantity === 1 ? 'item' : 'items' ]]</p>
```

Brackets also work inside attribute values, which is how you set a class or a link from state:

```html
<span class="badge [[ stock > 0 ? 'in' : 'out' ]]">…</span>
```

## Your turn

1. Show the line total: `price * quantity`, formatted with `.toFixed(2)`.
2. Make the badge say `In stock` when `stock` is above zero and `Sold out` otherwise.
3. Give the badge the class `in` or `out` to match, so it changes colour.

Set `stock` to `0` in the script to check both branches.
