---
layout: lesson
title: Event modifiers
---

# Event modifiers

Handlers often start with the same few lines: check which key was pressed, call `preventDefault()`. Modifiers move that into the template.

```html
<form @submit.prevent="save()">…</form>
<input @keydown.enter="add()">
<input @keydown.esc="draft = ''">
<input @keydown.ctrl.s.prevent="save()">
```

`.prevent` and `.stop` call the matching method on the event. Key names such as `.enter`, `.esc`, `.up` and `.down` filter keyboard events. `.ctrl`, `.shift`, `.alt` and `.meta` require that key to be held.

## Your turn

The input adds nothing at the moment.

1. Add the draft to the list when Enter is pressed: `@keydown.enter="add()"`.
2. Clear the draft when Escape is pressed.
3. Make the up and down arrows change `size` by one, with `.prevent` so the caret stays put.
