# Directives

Reference for every reactive attribute. Directives are scanned by `src/core/renderer.js` (via each directive's `scan()` hook) and executed on every render pass.

A few rules are universal:

- The expression scope inside any directive is `{ state, global, self, $route, $go, $mount, $db, $emit, $ancestors, $registry, $params, $element }`.
- Modifiers are dot-suffixes: `b-html.safe`, `b-sync.lazy.number`, `@click.prevent.stop`, `@keydown.enter.ctrl`.
- Directives that mount/unmount DOM (`b-if`, `b-for`, `b-mount`) leave a comment node anchor in place so subsequent renders can re-insert.

---

## b-if

Conditional mount. The element is removed from the DOM when the expression is falsy and re-inserted when it becomes truthy. State and listeners are reset on each remount.

```html
<p b-if="user.isLoggedIn">Welcome back!</p>
<empty-state b-if="todos.length === 0"></empty-state>
```

Use `b-show` instead when toggling is frequent, `b-if` is for branches that rarely flip.

## b-show

Toggles inline `display`. The element stays in the DOM; only its visibility changes. Preserves form values, focus, scroll position, and child component state.

```html
<aside b-show="sidebarOpen">…</aside>
```

The first time it runs, `b-show` records the existing `display` (e.g. `flex`, `grid`) so that a `false → true` transition restores the original value.

## b-for

Keyed list rendering. The element with `b-for` becomes the **template**; each iteration produces a sibling clone after a comment anchor.

```html
<ul>
  <li b-for="task in tasks">[[ task.title ]]</li>
</ul>
```

Inside the loop, `$index` is the zero-based position.

```html
<li b-for="task in tasks">#[[ $index + 1 ]] · [[ task.title ]]</li>
```

Event handlers in a row run in the row's own scope, so they see the loop
variable, `$index` and any outer loop's variable, and act on the item the row
is showing:

```html
<li b-for="task in tasks">
  <button @click="removeAt($index)">Remove</button>
</li>
```

### Keys

By default, items are tracked by:

1. `b-key="someProp"`, the property path you specify (dot notation supported).
2. `item.id` → `item._id` → `item.uuid` → `item.key`, auto-detected.
3. A WeakMap-backed monotonic counter for objects with no recognizable id.
4. `${index}-${value}` for primitives.

```html
<!-- Explicit key (best for inline / no-id arrays) -->
<div b-for="menu in menus" b-key="name">[[ menu.name ]]</div>

<!-- Nested path -->
<div b-for="row in rows" b-key="user.id">[[ row.user.name ]]</div>
```

### Inner directives in loops

`b-if`, `b-show`, `b-html`, `b-mount`, `b-enter`, `b-leave`, `b-init`, and `b-sync` all work inside `b-for`. Each row owns the effects for its own bindings, so changing one item's field re-runs only that row's bindings; the loop itself re-runs only when the list changes.

## b-text

Text content from a property path. Path-only, **no expressions, math, or function calls**. For anything beyond a single path, use `[[ … ]]` interpolation.

```html
<span b-text="user.name"></span>
<!-- Won't work: <span b-text="user.first + user.last"></span> -->
```

Path strings starting with `global.` resolve through the global state.

## b-html

Sets `innerHTML` to the result of an expression. Two forms:

| Form | Behavior |
|---|---|
| `b-html="expr"` | Raw, no sanitization. **Trusted content only.** |
| `b-html.safe="expr"` | Runs the value through `Lego.config.sanitize` (or the built-in fallback) before insertion. |

```html
<div b-html="article.body"></div>
<div b-html.safe="comment.bodyMarkdown"></div>
```

When the inserted HTML replaces existing bindings, the runtime tags those bindings dead and drops them from the parent block's binding list, they will not write to detached nodes on later renders.

## b-sync

Two-way binding for form inputs. Source of truth is the state path; the input is kept in sync, and user edits write back. Works with `<input>` (text, number, email, checkbox, radio), `<textarea>`, and `<select>`.

```html
<input b-sync="username">
<input type="checkbox" b-sync="agreed">
<textarea b-sync="bio"></textarea>
<select b-sync="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
```

Radio groups bind to a single state property, each radio's `value` attribute is matched against the property:

```html
<input type="radio" name="size" value="small"  b-sync="size">
<input type="radio" name="size" value="medium" b-sync="size">
<input type="radio" name="size" value="large"  b-sync="size">
```

### Modifiers

| Modifier | Effect |
|---|---|
| `.lazy` | Update on `change` instead of `input`. Good for expensive sync that shouldn't run on every keystroke. |
| `.number` | Coerce numeric inputs via `parseFloat` before writing. |
| `.trim` | Trim leading/trailing whitespace from string values. |

```html
<input b-sync.lazy="search">
<input type="number" b-sync.number="age">
<input b-sync.trim="email">
<input b-sync.lazy.number="quantity">
```

`b-sync` also works inside `b-for` against the loop variable:

```html
<li b-for="todo in todos">
  <input type="checkbox" b-sync="todo.done">
  <input b-sync="todo.title">
</li>
```

## b-init

Runs an expression **once**, the first time the binding executes.

```html
<canvas b-init="setupChart()"></canvas>
<section b-init="track('view', 'pricing')">…</section>
```

For block-level one-shot work, use the `mounted()` hook instead, `b-init` is element-level.

## b-enter

Fires when the element enters the viewport (`IntersectionObserver`).

```html
<img src="placeholder.svg" b-enter.once="loadImage()">
<div b-enter="trackImpression()">…</div>
```

The `.once` modifier disconnects the observer after the first fire.

## b-leave

Fires when the element **leaves** the viewport (after having entered at least once). Same `.once` modifier.

```html
<video b-enter="play()" b-leave="pause()"></video>
```

## b-mount

Reactively mounts a tag computed from state. The expression is evaluated; its string result is treated as a tag name. When the result changes, the previous element is unmounted and the new one is mounted in place.

```html
<div b-mount="$route.params.tab + '-panel'"></div>
```

```js
{
  view: 'list',
  switchView() { this.view = this.view === 'list' ? 'grid' : 'list'; }
}
```

```html
<div b-mount="view + '-panel'"></div>
```

A return value of `null` / `undefined` clears the target. To pass props on mount, use the imperative [`$mount`](/api/globals#mount).

## b-var

Captures a DOM ref into `this.$vars`. Useful for `.focus()`, `.play()`, canvas access, or any imperative API.

```html
<input b-var="emailInput">
<button @click="$vars.emailInput.focus()">Edit</button>
```

```js
{
  mounted() {
    this.$vars.emailInput.focus();
  }
}
```

## b-logic / b-data

Inject state at the template or instance level. Both names are equivalent, the runtime accepts either.

```html
<!-- Template default -->
<template b-id="user-card" b-logic="{ role: 'member' }">…</template>

<!-- Instance override -->
<user-card b-logic="{ name: 'Alice', role: 'admin' }"></user-card>
```

The expression is evaluated against the parent block's state, so you can pass scoped values:

```html
<child-card b-logic="{ user: currentUser, onSelect: pick }"></child-card>
```

Merge order (last wins): script logic → template `b-logic` → instance `b-logic`. See [Blocks](/tutorial/blocks#data-merging-the-three-tiers).

## b-props

Declared prop contract on the outer `<template>`. Declared props are reactive state keys: a parent binds them with `:prop-name="expr"` and the block re-renders when the expression changes; plain attributes on declared props are coerced by type. See [Props](/tutorial/props).

```html
<template b-id="user-card" b-props="{ user, title }">…</template>
```

Syntax: comma-separated entries of `name`, `name = default`, `name: Type`, or `name: Type = default`, brace-optional. `Type` is one of `String`, `Number`, `Boolean`, `Array`, `Object`, `Function`. Renames are not supported.

What it gets you:

- **Typo guard**: `<user-card b-logic="{ usre: ... }">` warns that `usre` is not declared.
- **Missing-prop warning**: `<user-card>` without `user` warns at mount (when no default fills it).

Defaults are declared inline (`count: Number = 0`) and evaluated once per instance; a value the block's own logic already sets takes precedence.

## b-id

Names an inline `<template>` so the runtime registers it as a custom element on `Lego.init()`.

```html
<template b-id="user-card">…</template>
```

`Lego.block()` adds this attribute automatically. In `.lego` files the build plugin derives the name from the filename, no `b-id` is needed.

## b-error

Defines an error boundary. When a descendant block crashes during render, mount, update, unmount, or an event handler, the nearest `b-error` ancestor renders the named fallback tag in place.

```html
<!-- Definition default -->
<template b-id="user-dashboard" b-error="error-card">…</template>

<!-- Per-instance override -->
<user-dashboard b-error="critical-error"></user-dashboard>
```

The fallback receives `$error: { message, stack, component }` injected as initial state. See the [Error Handling guide](/tutorial/error-handling) for boundary cascade rules and recursion limits.

## b-stylesheets

Adopts named [`Lego.init({ styles })`](/api/init#options-styles) entries into the block's Shadow DOM.

```html
<template b-id="signup-form" b-stylesheets="base forms">…</template>
<signup-form b-stylesheets="auth"></signup-form>
```

Definition-level (on the `<template>`) and instance-level (on the tag) keys both apply, in that order.

## b-cascade

Cascades stylesheet keys to descendant blocks.

```html
<body b-stylesheets="design-tokens" b-cascade="design-tokens">
  <!-- every block in the tree adopts design-tokens -->
</body>
```

Inherited keys are merged before explicit ones (so explicit wins on cascade order). Duplicates are deduped.

## Routing attributes

These attributes apply to ordinary `<a>` and `<form>` elements that are intercepted globally during `Lego.init()`.

### b-target

Specifies a CSS selector (or several space-separated selectors) for the navigation to render into. Falls back to `<lego-router>` when omitted.

```html
<a href="/profile"  b-target="#main">Profile</a>
<a href="/settings" b-target="#main #right-pane">Settings (two panes)</a>
```

### b-link

Attached to `<a>` elements with or without `b-target`. Controls history:

- `b-link` (or just `b-target`), pushes a new history entry (default).
- `b-link="false"`, performs the navigation without changing the URL.

```html
<a href="/sidebar/tools" b-target="#sidebar" b-link="false">Tools</a>
```

### b-action

On a `<form>`, suppresses the default browser submit (so you can route the submission through `@submit="…"` or a route handler). The runtime calls `preventDefault()` for you.

```html
<form b-action @submit="save()">…</form>
```

---

## Event handlers

`@event="…"` attaches a listener. The expression has access to `event` (and the alias `$event`).

```html
<button @click="count++">+1</button>
<input @input="search = $event.target.value">
```

### Action modifiers

| Modifier | Effect |
|---|---|
| `.prevent` | `event.preventDefault()` |
| `.stop` | `event.stopPropagation()` |
| `.self` | Only fire when `event.target === event.currentTarget` |

```html
<form @submit.prevent="save()">…</form>
<a @click.stop.prevent="open()">…</a>
```

### Key matchers (KeyboardEvent only)

System keys (AND-combined):

| Modifier | Matches when |
|---|---|
| `.ctrl` `.alt` `.shift` `.meta` | Corresponding modifier key was held |

Named keys (OR-combined):

| Modifier | Key |
|---|---|
| `.enter` | `Enter` |
| `.esc` / `.escape` | `Escape` |
| `.space` | `Space` |
| `.tab` | `Tab` |
| `.delete` | `Delete` |
| `.backspace` | `Backspace` |
| `.up` `.down` `.left` `.right` | Arrow keys |
| `.alpha` | Any single letter `a-z` |
| `.numbers` | Any digit `0-9` |
| Anything else | Direct case-insensitive match against `event.key` |

```html
<input @keydown.enter="submit()">
<input @keydown.ctrl.s.prevent="save()">
<input @keydown.esc="cancel()">
```
