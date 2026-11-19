---
layout: lesson
title: Slots
---

# Slots

Props pass data. **Slots** pass markup. A block marks where outside content should land with a `<slot>` element, and whatever you write between its tags is placed there.

```html
<!-- info-card.lego -->
<template>
  <div class="card">
    <slot></slot>
  </div>
</template>
```

```html
<info-card>
  <p>This paragraph ends up inside the card.</p>
</info-card>
```

Give a slot a `name` to have more than one, and target it with the `slot` attribute. Anything inside the `<slot>` tags is the fallback, shown when nothing is passed.

## Your turn

1. In `info-card.lego`, add a `<slot name="title">` inside the `<header>`, with `Untitled` as its fallback.
2. Add a default `<slot>` inside `.body`.
3. In `index.html`, give the first card an `<h3 slot="title">` and a paragraph of content.

The second card has no title, so it shows the fallback.
