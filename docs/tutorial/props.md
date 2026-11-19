# Props

Props are how a parent block hands data to a child. A block declares the names it accepts, the parent binds expressions to them, and the child sees every later change without doing anything.

::: tip Coming from React or Svelte?
| React | Svelte | LegoDOM |
|-------|--------|---------|
| `function Card({ title })` | `export let title` | `b-props="title"` |
| `<Card title={heading} />` | `<Card {heading} />` | `<user-card :title="heading">` |
| `title = 'Untitled'` default | `export let title = 'Untitled'` | `b-props="title = 'Untitled'"` |
:::

## Declaring props

`b-props` is the block's contract: the keys it expects from outside.

```html
<template b-id="user-card" b-props="name, role">
  <h3>[[ name ]]</h3>
  <p>[[ role ]]</p>
</template>
```

A declaration can also carry a type, a default, or both:

```
b-props="title: String = 'Untitled', count: Number = 0, items: Array = [], onPick: Function"
```

| Form | Meaning |
|---|---|
| `name` | Declared. A warning if nothing provides it. |
| `name: Type` | Declared, and plain attributes are coerced through `Type`. |
| `name = expr` | Declared with a default. |
| `name: Type = expr` | Both. |

`Type` is one of `String`, `Number`, `Boolean`, `Array`, `Object`, `Function`.

The default is an ordinary template expression, evaluated **once per instance**. That matters for objects and arrays: `items: Array = []` gives every `<user-card>` its own array, never one shared between them.

Braces are optional, so `b-props="{ name, role }"` and `b-props="name, role"` are the same thing. In a `.lego` file the attribute goes on the `<template>` tag; from JS it is the `props` option:

```js
Lego.block('user-card', {
  template: `<h3>[[ name ]]</h3><p>[[ role ]]</p>`,
  props: "name: String = 'Anonymous', role: String = 'Member'"
});
```

## Passing props: `:prop`

Bind a prop with a colon in front of its name:

```html
<template b-id="team-list">
  <user-card :name="lead.name" :role="lead.title"></user-card>
</template>
```

The expression is evaluated in the **parent's** scope, and it stays live. When `lead.name` changes, the parent re-runs that one binding, writes the new value into the child's state, and the child re-renders. Both happen in the same frame:

```js
list.state.lead.name = 'Grace';
await Lego.nextTick();
// the child's DOM already says Grace
```

Attribute names are case insensitive in HTML, so a camelCase prop is bound in kebab-case:

```html
<user-card :user-name="who"></user-card>   <!-- sets userName -->
```

Props work inside `b-for` exactly as anywhere else, with the row's scope:

```html
<li b-for="member in team">
  <user-card :name="member.name" :role="member.title"></user-card>
</li>

<!-- or with the block itself as the looped element -->
<user-card b-for="member in team" :name="member.name"></user-card>
```

The colon is a prop on any tag with a hyphen. A block that registers after
its parent rendered (a lazily loaded one, say) still gets the value: it waits
on the element and is applied when the block mounts. On a built-in element
such as `<button>` the colon binds the attribute instead; see
[Boolean attributes](/tutorial/templating#boolean-attributes-name).

## Passing props: plain attributes

A static value does not need an expression. Write the attribute, and the declared type decides how the string is read:

```html
<user-card name="Ada" role="Engineer"></user-card>
<order-row count="42" total="19.99" featured></order-row>
```

| Declared type | Attribute `x="…"` becomes |
|---|---|
| `String` (or none) | the string as written |
| `Number` | `Number(value)` |
| `Boolean` | `true` when present, `false` when absent or `="false"` |
| `Array` / `Object` | `JSON.parse(value)`, with a warning if it isn't JSON |

Attributes stay live too. Setting one after mount reflects onto the prop:

```js
card.setAttribute('role', 'Admin');
await Lego.nextTick();  // card.state.role === 'Admin'
```

Removing a Boolean attribute sets the prop to `false`. Removing any other kind leaves the current value alone: there is no string left to coerce, and blanking the prop would be worse than doing nothing.

## One-way flow

Props are ordinary reactive state keys. Nothing stops a block from writing to one, and sometimes that is exactly right (a local edit before the parent hears about it). But the parent's binding is the source of truth: the next time its expression re-runs, whatever the child wrote is overwritten.

If a child needs to tell the parent something, emit an event:

```js
Lego.block('user-card', {
  template: `<button @click="$emit('promote', { name })">Promote</button>`,
  props: 'name: String'
});
```

```html
<user-card :name="lead.name" @promote="promote($event.detail)"></user-card>
```

## Resolution order

A prop can be filled from several places. At mount, they are applied in this order, each one overwriting the last:

1. The block's own `logic` (the `.lego` `<script>`, or the `logic` option)
2. A `b-logic` attribute on the template, then on the instance
3. The declared default, but only if the key is still `undefined`
4. `:prop` bindings from the parent
5. Plain attributes matching a declared prop

After mount, `:prop` bindings and attribute changes keep writing; nothing else does.

## Warnings

With `b-props` declared, the runtime tells you when the contract is not met:

- A declared prop that ends up `undefined` and has no default.
- A `b-logic` key the block never declared, which is almost always a typo.

A block with no `b-props` validates nothing, so adding the contract is opt-in.

## Next Steps

- [Blocks](/tutorial/blocks) for the three logic tiers props merge into
- [Slots](/tutorial/slots) for passing markup rather than data
- [Lego.block()](/api/block) for the full option list
