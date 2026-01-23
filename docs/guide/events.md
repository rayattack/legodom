# Event Handling

LegoDOM provides a robust event handling system with support for modifiers, inline expressions, and automatic scope management.

## Listening to Events

Use the `@` prefix (shorthand for `v-on`) to listen to DOM events.

### Method Handlers

Calls a method defined in your block's logic.

```html
<style>
  self {
  }
  button { background-color: #000; color: #fff; padding: 5px 10px; }
</style>

<template>
  <input type="text" b-sync="name">
  <button @click="greet">Greet</button>
</template>

<script>
export default {
  name: '',
  greet(event) {
    alert('Hello ' + this.name + '!');
    // `event` is the native DOM event
    if (event) {
      alert(event.target.tagName);
    }
  }
}
</script>
```

### Inline Handlers

Execute inline JavaScript statements.

```html
<button @click="count++">Add 1</button>
<p>Count is: [[ count ]]</p>
```

You can pass arguments to methods:

```html
<button @click="say('hello')">Say Hello</button>
<button @click="warn('Form cannot be submitted yet.', $event)">
  Submit
</button>
```

Special variables available in inline handlers:
- `$event`: The original DOM event.

### Method Handlers vs Inline Handlers

LegoDOM distinguishes between referencing a method and calling it inline.

#### 1. Method Reference (`@click="ask"`)
- The event object is passed **automatically** as the first argument.

```html
<button @click="ask">Ask</button>
```

```javascript
ask(event) {
  console.log(event.type); // "click"
}
```

#### 2. Inline Call (`@click="ask()"`)
- No arguments are passed unless you specify them.
- `$event` is **NOT** available inside `ask()` unless passed explicitly.

```html
<button @click="ask()">Ask</button>
```

```javascript
ask(event) {
  // event is UNDEFINED
}
```

#### 3. Explicit Event (`@click="ask($event)"`)
- Pass `$event` explicitly to receive it.

```html
<button @click="ask($event)">Ask</button>
```

```javascript
ask(event) {
  console.log(event); // MouseEvent
}
```


## Event Modifiers

Event modifiers allow you to handle common event details (like preventing default behavior or listening for specific keys) directly in the template, keeping your JavaScript logic clean.

Modifiers are dot-delimited suffixes to the event name.

### Action Modifiers

| Modifier | Description | Equivalent JS |
| :--- | :--- | :--- |
| `.prevent` | Prevents default behavior | `event.preventDefault()` |
| `.stop` | Stops propagation | `event.stopPropagation()` |
| `.self` | Triggers only if event.target is the element itself | `if (event.target !== event.currentTarget) return` |

```html
<!-- Prevent page reload on submit -->
<form @submit.prevent="onSubmit"></form>

<!-- Stop click propagation -->
<a @click.stop="doThis"></a>

<!-- Chain modifiers -->
<a @click.stop.prevent="doThat"></a>
```

### Key Modifiers

Listen for specific keys on keyboard events.

```html
<!-- Only call vm.submit() when the `key` is `Enter` -->
<input @keydown.enter="submit">
```

#### Key Aliases

LegoDOM provides aliases for the most common keys:

- `.enter`
- `.tab`
- `.delete` (captures both "Delete" and "Backspace")
- `.esc`
- `.space`
- `.up`
- `.down`
- `.left`
- `.right`

#### System Modifier Keys

Trigger mouse or keyboard event listeners only when the corresponding modifier key is pressed.

- `.ctrl`
- `.alt`
- `.shift`
- `.meta` (Command on Mac, Windows key on Windows)

```html
<!-- Alt + Enter -->
<input @keydown.alt.enter="clear">

<!-- Ctrl + Click -->
<div @click.ctrl="doSomething">Do something</div>
```

#### Key Categories

- `.alpha`: Matches any letter (a-z, case insensitive)
- `.numbers`: Matches any digit (0-9)

```html
<!-- Only allow numbers -->
<input @keydown.numbers="validateNumber">
```

#### Exact Key Match

You can use any valid `KeyboardEvent.key` name (case-insensitive) as a modifier efficiently.

```html
<input @keydown.page-down="onPageDown">
<input @keydown.m="onMKey">
```

## Why use modifiers?

Without modifiers, your methods would be cluttered with DOM event details:

```javascript
// WITHOUT MODIFIERS
onEnter(event) {
    if (event.key !== 'Enter') return; // Clutter
    event.preventDefault(); // Clutter
    this.submit();
}
```

With modifiers, your method focuses purely on logic:

```javascript
// WITH MODIFIERS (@keydown.enter.prevent="submit")
submit() {
    // Pure business logic!
}
```
