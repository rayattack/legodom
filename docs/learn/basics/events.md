---
layout: lesson
title: Handling events
---

# Handling events

Listen to any DOM event by writing `@` and the event name. The value is an expression that runs when the event fires.

```html
<button @click="count++">Add one</button>
```

That is the whole counter. There is no setter to call and nothing to subscribe to. You change the value, and the parts of the page that read it update.

## Your turn

1. Make the first button add one to `count`.
2. Make the second button take one away.
3. Make the third button set `count` back to `0`.

Click a few times and keep an eye on the **State** tab.
