---
layout: lesson
title: Events from children
---

# Events from children

Props carry data down. To send news back up, a child emits an event.

```html
<button @click="$emit('vote', { amount: 1 })">Upvote</button>
```

`$emit` dispatches a real DOM `CustomEvent` from the block's element. The parent listens with the same `@` syntax used for clicks, and the payload arrives on `$event.detail`:

```html
<vote-buttons @vote="score += $event.detail.amount"></vote-buttons>
```

The child does not know or care who is listening.

## Your turn

1. In `vote-buttons.lego`, make the two buttons emit `vote` with an `amount` of `1` and `-1`.
2. In `score-board.lego`, listen for `vote` on the child and add the amount to `score`.
