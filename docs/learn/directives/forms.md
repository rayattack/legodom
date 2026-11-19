---
layout: lesson
title: Form inputs
---

# Form inputs

`b-sync` ties a form control to a piece of state in both directions. Typing changes the state, and changing the state updates the control.

```html
<input b-sync="email">
<input type="checkbox" b-sync="subscribed">
<select b-sync="plan">…</select>
```

It reads the control type and does the right thing: `value` for text, `checked` for checkboxes, the chosen option for selects.

Modifiers adjust the value on its way in:

| Modifier | Effect |
|---|---|
| `.number` | store a number, not a string |
| `.trim` | strip surrounding spaces |
| `.lazy` | update on blur rather than on every key |

## Your turn

1. Bind the name input to `name` with `.trim`.
2. Bind the quantity input to `quantity` with `.number`.
3. Bind the select to `color` and the checkbox to `gift`.

The summary line underneath is already reading all four.
