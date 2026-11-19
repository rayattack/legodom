---
layout: lesson
title: Watching for changes
---

# Watching for changes

Getters cover values. Sometimes you need a side effect instead: save a draft, log an event, call an API. That is what `$watch` is for.

```js
mounted() {
  this.$watch('volume', (next, previous) => {
    console.log('volume went from', previous, 'to', next);
  });
}
```

`mounted()` runs once, when the block appears on the page. `$watch` takes the name of a state key and a callback, and the callback fires only when the value really changes. Watchers stop by themselves when the block is removed.

## Your turn

1. In `mounted()`, watch `volume`.
2. In the callback, push a line such as `` `${previous} → ${next}` `` onto `history`.
3. Also `console.log` the change, then open the **Console** tab under the preview.
