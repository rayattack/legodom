---
layout: lesson
title: Scoped styles
---

# Scoped styles

Each block renders into its own Shadow DOM, so the CSS in a block's `<style>` section applies to that block and nothing else. You can style `button` without a class name and never touch a button elsewhere on the page.

To style the block's own element, use the selector `self`:

```css
self {
  display: block;
  padding: 16px;
}
```

## Your turn

`index.html` has a plain button and a `<fancy-button>`. Both look the same right now.

1. In `fancy-button.lego`, style `button` with a background of `#2f6bff`, white text, no border and a `10px` radius.
2. Add a `self` rule that sets `display: inline-block` and `margin: 8px 0`.

The plain button on the page stays exactly as it was. That is the encapsulation doing its job.
