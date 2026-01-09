# Examples

Explore these hands-on examples to learn Lego patterns and best practices.

## Quick Examples

### Counter

A simple reactive counter demonstrating basic state and events.

```html
<template b-id="click-counter">
  <style>
    button { font-size: 1.2rem; padding: 0.5rem 1rem; }
  </style>
  <p>Count: {{ count }}</p>
  <button @click="count++">Increment</button>
</template>

<click-counter b-data="{ count: 0 }"></click-counter>
```

### Input Binding

Two-way data binding with `b-sync`.

```html
<template b-id="name-input">
  <input b-sync="name" placeholder="Enter your name">
  <p b-show="name">Hello, {{ name }}!</p>
</template>

<name-input b-data="{ name: '' }"></name-input>
```

### Todo List

Lists with `b-for`.

```html
<template b-id="todo-list">
  <ul>
    <li b-for="todo in todos">
      <input type="checkbox" b-sync="todo.done">
      <span class="{{ todo.done ? 'done' : '' }}">{{ todo.text }}</span>
    </li>
  </ul>
</template>

<todo-list b-data="{
  todos: [
    { text: 'Learn Lego', done: true },
    { text: 'Build an app', done: false }
  ]
}"></todo-list>
```

## Full Applications

### [Todo App](/examples/todo-app)

A complete todo application with:
- Add/remove todos
- Mark as complete
- Filter by status
- Local storage persistence

### [Routing Demo](/examples/routing)

Single-page application with:
- Multiple pages
- Dynamic routes
- Navigation
- Route parameters

### [SFC Showcase](/examples/sfc-showcase)

Using Single File Components:
- User cards
- Product grid
- Modal dialogs
- Form validation

### [Form Validation](/examples/form)

Advanced form handling:
- Input validation
- Error messages
- Submit handling
- Reset functionality

## CodePen Examples

Try these examples directly in your browser:

- [Simple Counter](https://codepen.io/ortserga/pen/XJKdMJm)
- [Todo App](https://codepen.io/ortserga/pen/todo)
- [Dynamic Form](https://codepen.io/ortserga/pen/form)

## Next Steps

- Check the [API Reference](/api/)
- Read the [Guide](/guide/)
- View the [source code](https://github.com/rayattack/Lego)
