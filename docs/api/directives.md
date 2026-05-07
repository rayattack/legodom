# Directives

Special attributes that control DOM behavior.

## b-show

Conditionally render an element.

```html
<div b-show="loading">Loading...</div>
<div b-show="!loading">Content loaded!</div>
```

## b-if

Conditionally renders the element. Unlike `b-show`, this actually removes the element from the DOM when false and re-inserts it when true.

```html
<div b-if="isLoggedIn">
  Welcome back!
</div>
```

## b-html

Renders raw HTML. **Security Risk**: Use with caution.

```html
<div b-html="htmlContent"></div>
```

## b-for

Render a list of items.

```html
<ul>
  <li b-for="user in users">
    [[ user.name ]]
  </li>
</ul>
```

## b-sync

Two-way data binding for form inputs.

```html
<input b-sync="username" placeholder="Enter username">
<p>You typed: [[ username ]]</p>
```

You can also sync nested properties or list items in a `b-for` loop:

```html
<input b-sync="user.profile.name">
```

## b-var

Creates a reference to the DOM element in the block's state under `$vars`.

```html
<div b-var="myDiv"></div>
```

In your script:
```js
this.mounted = function() {
  console.log(this.$vars.myDiv); // Access the DOM element
}
```

## b-props

Declares the prop contract for a block. Goes on the outer `<template>` (or as the 7th argument to `Lego.block()`). Pure metadata — does not change how data flows into the block.

```html
<template b-id="user-card" b-props="{ user, onSelect, title }">
  <h2>[[ title ]]</h2>
  <p>[[ user.name ]]</p>
</template>
```

```html
<user-card b-logic="{ user: currentUser, onSelect: pick }"></user-card>
```

When a contract is declared, LegoDOM warns at mount-time if:

- a `b-logic` key is passed that is not in the declared list (typo guard)
- a declared name resolves to `undefined` after the three-tier merge (missing prop)

**Syntax**: identifier list, brace-optional, comma-separated. No values, defaults, or renames in v1 — use `b-logic` for values, the script tier for defaults.

```html
<!-- valid -->
b-props="{ age, name, dateOfBirth }"
b-props="age, name, dateOfBirth"

<!-- invalid (parse error, contract not registered) -->
b-props="{ name: 'Alice' }"
b-props="{ name = 'Guest' }"
```

Omitting `b-props` preserves existing behavior: any `b-logic` key merges in, no validation runs.


