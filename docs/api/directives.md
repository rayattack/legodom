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

## @event

Event listeners.

```html
<button @click="save()">Save</button>
<input @input="validate($event)">
```
