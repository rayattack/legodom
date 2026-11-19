---
layout: lesson
title: Showing and hiding
---

# Showing and hiding

Attributes that start with `b-` are **directives**. Two of them decide whether an element appears.

`b-if` adds the element when the expression is true and removes it from the DOM when it is false:

```html
<p b-if="items.length === 0">Nothing here yet.</p>
```

`b-show` keeps the element in the DOM and only toggles its `display`:

```html
<section b-show="open">…</section>
```

Use `b-show` for things that flip back and forth, because the element keeps its scroll position, focus and input values. Use `b-if` for a branch that is usually absent.

## Your turn

1. Show the details panel only while `open` is true, with `b-show`.
2. Show the "logged out" message with `b-if` when `user` is `null`.
3. Show the welcome line with `b-if` when there is a user.

Type in the notes box, close the panel and open it again. The text is still there, because `b-show` never destroyed it.
