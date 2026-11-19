---
layout: lesson
title: Objects and arrays
---

# Objects and arrays

State is reactive all the way down. Nested objects and arrays are tracked the same way top-level values are, so you mutate them the way you always have.

```js
this.user.address.city = 'Lagos';
this.tags.push('new');
this.tags.splice(0, 1);
```

There is one thing to remember. Methods like `filter` and `map` return a **new** array and leave the original alone. Assign the result back when you want the page to change:

```js
this.tags = this.tags.filter(tag => tag !== 'old');
```

## Your turn

1. Make `move()` set `user.address.city` to `'Lagos'`.
2. Make `addTag()` push `'tag ' + (this.tags.length + 1)` onto `tags`.
3. Make `clearTags()` empty the list.

Only the text that reads the changed value is touched. The rest of the block is left as it is.
