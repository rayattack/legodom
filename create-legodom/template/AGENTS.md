# AGENTS.md

This is a LegoDOM app. LegoDOM (npm `lego-dom`) turns HTML templates into
reactive custom elements called **blocks**. It is not React, Vue, Svelte, Lit or
Alpine: no JSX, no hooks, no virtual DOM, no `.vue`/`.svelte`/`.jsx` files. The
syntax on this page is the whole syntax. Do not reach for another framework's
API because it looks similar.

- Types for the installed version: `node_modules/lego-dom/dist/lego.d.ts`. If
  this file and the types disagree, the types win.
- Full reference: https://rayattack.github.io/legodom/llms-full.txt

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server. `.lego` files hot reload. |
| `npm run build` | Production build. Fails on an invalid `.lego` file name or a TypeScript error in `<script lang="ts">`. |
| `npx lego-studio snap --root src` | Renders every block on the server, no browser. Prints `Error <block>…` and exits 1 when a template expression does not compile or evaluate. Writes HTML snapshots to `src/__snapshots__/`. |
| `npx lego-studio` | Block workshop at http://localhost:6006: each block in isolation, controls generated from `b-props`. |

`src/app.js` sets `Lego.config.strict = import.meta.env.DEV`, so in dev an
unknown name in a template is an error instead of empty text.

## Layout

- `src/app.js` (`app.ts` in TypeScript projects): imports `lego-dom` and
  `virtual:lego-blocks` (which registers every `.lego` file under `src/`),
  registers routes and globals, then calls `Lego.init()`.
- `src/**/*.lego`: one block per file. **The file name is the tag name**:
  `user-card.lego` is `<user-card>`. Names are kebab-case with at least one
  hyphen; `card.lego` fails the build, `UserCard.lego` becomes `user-card`.
- `index.html`: places the root block, `<my-app>`.

## A block

```html
<!-- src/todo-list.lego -->
<script>
export default {
  todos: [],
  draft: '',
  add() {
    const title = this.draft.trim();
    if (!title) return;
    this.todos.push({ id: Date.now(), title, done: false });
    this.draft = '';
  },
  remove(todo) {
    this.todos = this.todos.filter(t => t !== todo);
  },
  get remaining() {
    return this.todos.filter(t => !t.done).length;
  }
}
</script>

<template b-props="title: String = 'Todos'">
  <h2>[[ title ]] ([[ remaining ]] left)</h2>
  <form @submit.prevent="add()">
    <input b-sync="draft" placeholder="What needs doing?">
    <button>Add</button>
  </form>
  <ul>
    <li b-for="todo in todos">
      <input type="checkbox" b-sync="todo.done">
      <span class="[[ todo.done ? 'done' : '' ]]">[[ todo.title ]]</span>
      <button @click="remove(todo)">Remove</button>
    </li>
  </ul>
  <p b-if="todos.length === 0">Nothing yet.</p>
</template>

<style>
  self { display: block; }
  .done { text-decoration: line-through; }
</style>
```

Use it anywhere as `<todo-list title="Groceries"></todo-list>`.

## Script section

- The script is an ES module. Import what you need, declare top-level helpers
  and constants, and `export default { … }` the block's logic object:
  ```js
  import { fetchTodos } from './api.js';
  const PAGE = 20;
  export default {
    todos: [],
    async mounted() { this.todos = await fetchTodos(PAGE); }
  }
  ```
  `Lego` and `$db` are in scope without an import.
- Methods use shorthand: `add() { … }`. An arrow-function method
  (`add: () => { … }`) gets the wrong `this` and silently does nothing. Arrows
  inside a method body are fine.
- `this` is the reactive state. Assigning (`this.draft = ''`) and mutating
  (`this.todos.push(x)`, `this.user.name = 'Ada'`) both re-render whatever read
  the value. `Set`, `Map` and `Date` are not proxied: build a new one and
  assign it (`this.tags = new Set(this.tags).add(tag)`).
- Getters (`get remaining() { … }`) are cached computed values.
- Hooks: `mounted()` (may be `async`; `this.$loading` is true until it
  settles), `beforeUpdate()`, `updated()`, `unmounted()` (clear timers here),
  `errorCaptured(err, info)` (return `false` to swallow).
- Helpers on `this`: `$element` (host element), `$vars` (refs from `b-var`),
  `$emit(name, detail)`, `$watch(source, cb, { immediate })`, `$route`,
  `$go`, `$mount`, `$parent`.
- In a TypeScript project write `<script lang="ts">`.

## Template expressions

`[[ expr ]]` works in text and inside attribute values. Directive values,
`@event` values and `:name` values are expressions without the brackets.

`:name="expr"` on a built-in element binds the attribute. Boolean attributes
(`disabled`, `hidden`, `checked`, `open`, `required`, …) are present when the
value is truthy and removed when it is falsy: `<button :disabled="busy">`. Any
other attribute is removed only for `null`/`undefined`, so
`:aria-expanded="open"` writes `"false"`. `:value`, `:checked` and `:selected`
also set the live property. On a block, `:name` passes a prop instead.

Expressions are a compiled JavaScript subset, not `eval`:

- **Supported**: property access, calls, `?.`, `??`, ternaries, arithmetic,
  comparison and logical operators, template literals, array and object
  literals, arrow functions with an expression body
  (`items.filter(i => i.done)`), `typeof`, `new` on the allowed globals,
  `=`, `+=`, `-=`, `*=`, `/=`, `++`, `--`, and the comma operator
  (`a = 1, b = 2`).
- **Not supported**: `;` and multiple statements, `{ }` bodies, spread `...`,
  destructuring, regex literals, `||=`, `&&=`, `??=`, `if`, `for`, `await`.
  Move that logic into a method.
- **Names** resolve to: the `$` helpers, then block state, then `global`,
  `self` (the element the binding sits on), `event` / `$event` (handlers only),
  then only these globals: `Math JSON Date Number String Boolean Array Object
  parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent
  encodeURI decodeURI console Intl Promise Set Map RegExp NaN Infinity
  undefined`. `window`, `document`, `fetch` and `localStorage` are not
  reachable from a template; call a method.
- Call methods with parentheses, `[[ total() ]]`, or make them getters.
  `[[ total ]]` on a method prints the function's source text.

## Directives

| Directive | Use |
|---|---|
| `b-if="cond"` | Add or remove the element. |
| `b-show="cond"` | Toggle `display: none`; keeps state, focus and inputs. |
| `b-for="item in list"` | Repeat the element per array item. `$index` is the position, in bindings and in handlers. Key with `b-key="id"` (default: `id`, `_id`, `uuid`, `key`). |
| `b-sync="path"` | Two-way binding for `input`, `textarea`, `select`, checkbox, radio. Modifiers `.lazy` `.number` `.trim`. |
| `b-text="path"` | Text from a property path (no expressions). |
| `b-html="expr"` | Raw `innerHTML`, trusted content only. `b-html.safe` sanitizes first. |
| `b-var="name"` | Element ref at `this.$vars.name`. |
| `b-init="expr"` | Run once when the element first binds. |
| `b-enter="expr"` / `b-leave="expr"` | Run when the element enters or leaves the viewport. `.once` modifier. |
| `b-mount="tagExpr"` | Mount the block whose tag the expression returns. |

Events: `@click="save()"`, or a bare `@click="save"` (called with the event).
`$event` is the DOM event. Modifiers: `.prevent` `.stop` `.self`; keys
`.enter` `.esc` `.space` `.tab` `.up` `.down` `.left` `.right` `.delete`
`.backspace`; system keys `.ctrl` `.alt` `.shift` `.meta`, as in
`@keydown.ctrl.s.prevent="save()"`.

## Props, events and slots between blocks

- Declare on the `<template>` tag: `b-props="label: String = 'Save', count: Number = 0, items: Array = [], busy: Boolean"`.
  Types: `String Number Boolean Array Object Function`. Defaults are
  expressions, evaluated per instance.
- Live value from the parent: `<user-card :user-name="lead.name">`. Evaluated in
  the parent's scope, re-applied when it changes. Kebab-case attribute,
  camelCase prop (`userName`).
- Static value: `<user-card name="Ada" count="3" featured>`, coerced by the
  declared type (a Boolean is `true` when present, Array/Object parse JSON).
- Child to parent: `this.$emit('picked', { id: this.id })` dispatches a
  bubbling, composed `CustomEvent`. Parent:
  `<user-card @picked="choose($event.detail.id)">`.
- Data flows down. A child may write its own prop, but the parent's next update
  overwrites it; emit an event instead.
- Slots are native: `<slot></slot>`, `<slot name="footer">fallback</slot>`, and
  `<span slot="footer">` in the parent.

## Styling

- A `.lego` file's `<style>` is scoped to the block by Shadow DOM. `self { }`
  styles the block's own element. Page CSS does not reach inside; CSS custom
  properties (`var(--brand)`) do.
- `<template b-shadow="false">` renders into the light DOM instead: page CSS
  applies, selectors are prefixed with the tag name, slots are emulated. Use it
  for global design systems, native form submission and ARIA id references.
- Shared sheets: `Lego.init(document.body, { styles: { base: ['/base.css'] } })`
  then `<template b-stylesheets="base">`.

## App state, routing, persistence

- Global state: set `Lego.globals.user = { … }` in JS, read
  `[[ global.user.name ]]` in templates and `Lego.globals.user` in methods. It
  is reactive like block state.
- Routes, in `src/app.js`: `Lego.route('/users/:id', 'user-page')`,
  `Lego.route('*', 'not-found')`. First match wins, so register catch-alls last.
  An optional third argument guards the route:
  `({ path, params }) => boolean | Promise<boolean>`.
- Routes render into `<lego-router></lego-router>`. Links need `b-link`:
  `<a href="/users/42" b-link>`. A plain `<a href>` does a full page load.
  `b-target="#panel"` renders into another element.
- Read `$route.params.id` (or `$params.id`) and `$route.query`. Navigate from a
  method with `this.$go('/users/42').get()`.
- Persisted state: `theme: $db('theme').default('light')` in the logic object
  is saved to localStorage and synced across tabs. `.debounce(500)` batches
  writes.

## Sharp edges

Each of these looks right and is wrong:

1. Arrow-function methods have the wrong `this`. Use method shorthand.
2. `@click="a = 1; b = 2"` is a syntax error and nothing runs. Use
   `a = 1, b = 2` or a method.
3. Spread, destructuring and statements are not template syntax. The binding
   fails, and the raw `[[ … ]]` text can end up on the page.
4. `[[ method ]]` without `()` prints source code.
5. `b-for="(item, i) in list"` does not work. Write `item in list` and use
   `$index`.
6. `b-if` on the same element as `b-for` is ignored. Filter in the loop
   expression (`b-for="t in todos.filter(t => !t.done)"`) or put `b-if` on a
   child element.
7. `b-for` iterates arrays only. For an object use
   `b-for="entry in Object.entries(obj)"` and read `entry[0]`, `entry[1]`.
8. `disabled="[[ busy ]]"` leaves the attribute present, so the element is
   disabled even when `busy` is false. Write `:disabled="busy"`.
9. Mutating a `Set`, `Map` or `Date` in place does not re-render. Assign a new
   one.
10. Outside strict mode an unknown name renders as empty text, so a typo fails
    silently.
11. A plain `<a href>` reloads the page. Add `b-link`.
12. A block's tag must contain a hyphen, and the `.lego` file name decides it.
13. In a `Lego.block()` JavaScript template string, `${}` is JavaScript
    interpolation. Use `[[ ]]` for bindings and escape `\${` inside a template
    literal that belongs to a `[[ ]]` expression.
14. `import` in a `.lego` script needs the Vite plugin. A `.lego` file loaded
    at runtime (`loader`, `manifest`, `Lego.defineLegoFile`) or passed to the
    server's `defineLegoFile` as text must be self-contained; top-level helpers
    are fine there, imports are an error.
