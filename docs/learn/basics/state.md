---
layout: lesson
title: Adding state
---

# Adding state

A block that always says the same thing is not much use. Blocks get their data from the `<script>` section, which exports a plain object. That object is the block's **state**.

```html
<script>
export default {
  name: 'Ada'
}
</script>
```

To show a piece of state in the template, wrap it in double square brackets:

```html
<h2>Hello, [[ name ]]!</h2>
```

## Your turn

The script already declares `name` and `visits`. The template ignores both.

1. Replace the hard-coded name with `[[ name ]]`.
2. Show the number of visits in the paragraph with `[[ visits ]]`.
3. Change `name` in the script and watch the preview follow.

Open the **State** tab under the preview at any point. It shows the live state of every block on the page.
