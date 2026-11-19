---
layout: lesson
title: Passing props
---

# Passing props

Three identical badges are not much of a team. A parent hands data to a child through **props**.

The child declares what it accepts with `b-props` on its `<template>`:

```html
<template b-props="name, role = 'Member'">
```

A declaration can carry a default, a type, or both: `count: Number = 0`.

The parent passes a value by writing the prop name with a colon in front. The value is an expression, evaluated in the parent:

```html
<user-badge :name="lead.name" :role="lead.role"></user-badge>
```

The binding stays live. When the parent's data changes, the child updates.

## Your turn

1. In `user-badge.lego`, declare the props `name` and `role`, with `'Member'` as the default role.
2. In `team-page.lego`, pass `member.name` and `member.role` to the badge inside the loop.
3. Press **Promote Grace** and watch one badge change.

A fixed string needs no colon: `<user-badge name="Ada">` works too.
