---
layout: lesson
title: Blocks inside blocks
---

# Blocks inside blocks

A block's template can use other blocks. There is still nothing to import: write the tag, and it works wherever it appears.

```html
<template>
  <h2>The team</h2>
  <user-badge></user-badge>
  <user-badge></user-badge>
</template>
```

Every instance has its own state, so two badges never share a click count.

## Your turn

This project has two files. `team-page.lego` is the page, `user-badge.lego` is a small badge with a wave counter.

1. In `team-page.lego`, replace the placeholder paragraph with three `<user-badge>` tags.
2. Click the wave button on one of them.

Only that badge counts up. The **State** tab lists each instance separately.
