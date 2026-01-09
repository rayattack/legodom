# Directives

Special attributes that control DOM behavior.

## b-show

Conditionally render an element.

```html
<div b-show="loading">Loading...</div>
<div b-show="!loading">Content loaded!</div>
```

## b-for

Render a list of items.

```html
<ul>
  <li b-for="user in users">
    {{ user.name }}
  </li>
</ul>
```

## b-sync

Two-way data binding for form inputs.

```html
<input b-sync="username" placeholder="Enter username">
<p>You typed: {{ username }}</p>
```

## @event

Event listeners.

```html
<button @click="save()">Save</button>
<input @input="validate($event)">
```
