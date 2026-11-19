---
layout: lesson
title: Dynamic blocks
---

# Dynamic blocks

Sometimes which block appears depends on state: the active tab, the current step of a wizard. `b-mount` takes an expression that produces a tag name and mounts that block inside the element.

```html
<div b-mount="active + '-pane'"></div>
```

When the value changes, the old block is unmounted and the new one takes its place. An empty value clears the element.

## Your turn

There are three pane blocks: `summary-pane`, `details-pane` and `reviews-pane`.

1. Give the empty `<div>` a `b-mount` that builds the tag name from `active`.
2. Make each tab button set `active` to its `tab.id`.
3. Give the active button the class `on` so it is highlighted.
