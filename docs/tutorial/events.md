# Events

`@event="…"` attaches a listener. The expression has access to your state, the globals, every `$`-helper, and the DOM event itself.

```html
<button @click="count++">+1</button>
<input @input="search = event.target.value">
<form @submit.prevent="save()">…</form>
```

## Three handler styles

### 1. Method reference

```html
<button @click="greet">Greet</button>
```

```js
greet(event) {
  alert(`Hello ${this.name}!`);
}
```

If the expression evaluates to a function, the runtime calls it with the event automatically. Use this when the handler is a simple method dispatch with no arguments.

### 2. Inline expression

```html
<button @click="count++">+1</button>
<input @input="name = event.target.value">
```

The expression is executed directly. The DOM event is available as `event` (and `$event`, when needed for clarity in templates that already use `event` for something else).

### 3. Method call

```html
<button @click="say('hello')">Say Hello</button>
<a @click="warn('cannot submit', event)">Submit</a>
```

A method call lets you pass arguments. Pass `event` explicitly if the method needs it.

::: tip Reference vs call
`@click="ask"` auto-passes the event. `@click="ask()"` does **not**, it calls `ask` with no arguments. Pass `event` yourself when you need it: `@click="ask(event)"`.
:::

## Action modifiers

| Modifier | Effect |
|---|---|
| `.prevent` | `event.preventDefault()` |
| `.stop` | `event.stopPropagation()` |
| `.self` | Fires only when `event.target === event.currentTarget` |

```html
<form @submit.prevent="save()">…</form>
<a @click.stop.prevent="open()">…</a>
<div @click.self="onlyMe()">…</div>
```

Modifiers stack, order doesn't matter for these three.

## System modifier keys (KeyboardEvent + MouseEvent)

| Modifier | Required state |
|---|---|
| `.ctrl`  | `event.ctrlKey` is `true` |
| `.alt`   | `event.altKey` is `true` |
| `.shift` | `event.shiftKey` is `true` |
| `.meta`  | `event.metaKey` is `true` (Cmd on macOS, Win key on Windows) |

System modifiers are AND-combined: `@keydown.ctrl.shift.k` requires Ctrl **and** Shift held with the K key.

```html
<input @keydown.ctrl.s.prevent="save()">
<div   @click.shift="multiSelect(item)">…</div>
```

## Key matchers (KeyboardEvent only)

Named key aliases:

| Modifier | Key |
|---|---|
| `.enter` | `Enter` |
| `.esc` / `.escape` | `Escape` |
| `.space` | `Space` (matches `' '`) |
| `.tab` | `Tab` |
| `.delete` | `Delete` |
| `.backspace` | `Backspace` |
| `.up` `.down` `.left` `.right` | Arrow keys |

Categories:

| Modifier | Matches |
|---|---|
| `.alpha` | Any single letter `a-z` (case-insensitive) |
| `.numbers` | Any digit `0-9` |

Anything else is matched directly (case-insensitive) against `event.key`, so `@keydown.k`, `@keydown.f1`, `@keydown.pageup` all work.

Multiple key matchers in the same handler are OR-combined, `@keydown.up.down="step()"` fires for either arrow key.

```html
<input @keydown.enter="submit()">
<input @keydown.esc="cancel()">
<input @keydown.numbers="onlyDigits()">
<input @keydown.up.down.prevent="step($event)">
```

## Why modifiers

Without them, every handler reimplements the same boilerplate:

```js
onEnter(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  this.submit();
}
```

With modifiers, the template carries the routing rules and the handler stays focused:

```html
<input @keydown.enter.prevent="submit()">
```

```js
submit() { /* pure */ }
```

## Cleanup

You don't need to remove listeners attached via `@event`. The runtime tracks them and removes them automatically when the block unmounts. Same for `b-sync`.

If you attach a listener manually (e.g. `window.addEventListener('resize', …)` from `mounted()`), you do need to remove it from `unmounted()`.
