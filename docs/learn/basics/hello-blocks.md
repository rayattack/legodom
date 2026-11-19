---
layout: lesson
title: Your first block
---

# Your first block

Welcome. This tutorial runs LegoDOM right here in the page: the editor is on the right, the result is underneath it, and everything updates as you type.

In LegoDOM a component is called a **block**. A block is an HTML `<template>` with a tag name. The file `hello-world.lego` defines one, and the file name is the tag name, so it is used as `<hello-world>`.

Nothing imports it. You write the tag where you want it and the runtime does the rest.

## Your turn

Open `index.html` and put the block on the page:

```html
<hello-world></hello-world>
```

Then add a second one underneath. Each tag is its own instance.

::: tip Why the hyphen?
Blocks are real custom elements, and the browser requires custom element names to contain a hyphen. `hello-world` works, `hello` does not.
:::
