---
layout: lesson
title: Rendering lists
---

# Rendering lists

`b-for` repeats an element once per item in a list.

```html
<li b-for="brick in bricks">[[ brick.color ]]</li>
```

The element carrying `b-for` is the template for one row. Inside it, `brick` is the current item and `$index` is its position, starting at zero.

Rows are tracked by key, so adding or removing one item leaves the others in place. The runtime uses the item's `id` when it has one. Name a different field with `b-key`:

```html
<li b-for="brick in bricks" b-key="sku">…</li>
```

## Your turn

1. Turn the single `<li>` into a row per brick with `b-for`.
2. Show the position, colour and stud count: `1. red, 4 studs`.
3. Add a remove button to each row that calls `remove(brick)`.

Then press **Add brick**. Only one new `<li>` is created.
