---
layout: lesson
title: Remembering state
---

# Remembering state

State lives in memory, so a page reload wipes it. For the values worth keeping, declare them with `$db`:

```js
export default {
  theme: $db('myapp.theme').default('light')
}
```

That one line reads the saved value at start-up, writes it back whenever it changes, and keeps other tabs of the same site in step. It is stored in `localStorage` under the key you give it.

Add `.debounce(300)` to a value that changes rapidly, so a slider drag does not write on every pixel.

## Your turn

1. Change `count` so it is stored under `'learn.count'` with a default of `0`.
2. Change `note` the same way, under `'learn.note'`, with a default of `''` and a `300` ms debounce.
3. Click a few times, type something, then press the reload button above the preview.

Before the change the preview starts again from zero. After it, your values come back.
