# Directives

A directive is an attribute that turns ordinary DOM into reactive DOM. Type `b-for="task in tasks"` on an `<li>` and that one element becomes a template. The list takes over from there. Type `b-sync="email"` on an `<input>` and the value flows both ways without a single line of glue.

That's all directives are. There are about a dozen of them. Each one earns its place by solving one specific problem you'd otherwise solve by hand.

The page is ordered roughly by the order you'll meet them in real work, not alphabetically. The right-rail lists every directive by name. Jump straight there if that's why you came.

## `[[ ]]`: interpolation

You already know the first one. You've been using it.

```html
<h1>[[ title ]]</h1>
<p>You have [[ tasks.length ]] task[[ tasks.length === 1 ? '' : 's' ]].</p>
```

`[[ … ]]` runs whatever JavaScript expression you put inside it against your block's state. It's the workhorse: math, ternaries, method calls, anything that produces a string is fair game. It works in text content and inside attribute values:

```html
<a href="/users/[[ user.id ]]" class="card [[ user.online ? 'live' : '' ]]">
  [[ user.name ]]
</a>
```

When the expression evaluates to `null` or `undefined`, the rendered text is the empty string, no `"undefined"` showing up in your UI.

## `b-text`: path-only text

```html
<span b-text="user.name"></span>
```

Looks like `[[ … ]]`, but only takes a property path. No expressions, no math, no function calls. It's marginally faster and a bit safer when the value really is just a path.

You almost never need it. `[[ user.name ]]` is what your fingers will type, and that's fine. Reach for `b-text` only when the binding is in a hot loop and the value is genuinely a single path.

## `b-show`: toggling visibility

```html
<aside b-show="sidebarOpen">…</aside>
```

`b-show` toggles the inline `display` style. The element stays in the DOM, keeps its state, keeps its scroll position, keeps the focus the user just put inside it. Cheap to flip on and off.

The first time it runs, the runtime records whatever inline `display` you authored (`flex`, `grid`, whatever) so a `false → true` transition restores the original value instead of clearing to the browser default.

## `b-if`: mounting conditionally

```html
<empty-state b-if="todos.length === 0"></empty-state>
```

`b-if` actually adds and removes the element from the DOM. Each remount is a fresh start, listeners reattach, child blocks re-snap, any ephemeral state is gone.

### `b-show` vs `b-if`

The choice is almost too simple to write down: if the user toggles it back and forth, use `b-show`. If it's a branch they'll see at most once per page (a 404, an empty state, a logged-out splash), use `b-if`.

When in doubt, use `b-show`. It's never wrong; just sometimes slightly heavier than necessary.

## `b-for`: rendering lists

```html
<ul>
  <li b-for="task in tasks">[[ task.title ]]</li>
</ul>
```

The `<li>` with `b-for` becomes the template. It's removed from the live DOM and replaced with one clone per item. Each clone gets its own scope where `task` is bound to the current item.

Inside the loop you also get `$index` (zero-based position):

```html
<li b-for="task in tasks">#[[ $index + 1 ]] · [[ task.title ]]</li>
```

You can iterate any iterable, arrays of primitives, arrays of objects, the result of a getter that returns a filtered list. `b-for="x in items.filter(i => i.active)"` is fine if you prefer it inline over a getter.

### Keys (`b-key`)

When the array changes, items added, removed, reordered, replaced, LegoDOM needs a way to tell which DOM node corresponds to which item. Otherwise every change is "throw it all away, rebuild from scratch".

By default it looks for `id`, `_id`, `uuid`, or `key` on each item, in that order, and uses whichever it finds. So if your data looks like `{ id: 1, title: 'thing' }`, you don't need to do anything.

When your items don't have an obvious id (you're iterating over a hand-crafted array of objects, say), name the key explicitly:

```html
<li b-for="menu in menus" b-key="name">[[ menu.label ]]</li>
```

`b-key` accepts a dotted path too, `b-key="user.id"` works.

Why bother? An `<input>` inside a list keeps its focus and selection across reorders only if the keys are stable. Child blocks inside the list don't unmount and remount on every render, their `mounted()` hooks fire once and stay mounted as long as the key sticks around.

If you don't supply keys and your items have no recognizable id, the runtime falls back to a per-object identity counter. It works, but reordering will look like a full rebuild.

## `b-sync`: two-way form binding

If you've ever wired up a form by hand, the `value` attribute, the `onChange` handler, the bookkeeping for what's "dirty", `b-sync` will feel like cheating.

```html
<input b-sync="email" placeholder="you@example.com">
<p>Hello, [[ email ]]!</p>
```

That's it. The input's value is the state. The state's value is the input. Type, and the `<p>` updates as you type.

It works on every form control you'd expect:

```html
<input b-sync="agreed" type="checkbox">
<input b-sync="size" type="radio" value="small">
<input b-sync="size" type="radio" value="medium">
<input b-sync="size" type="radio" value="large">
<select b-sync="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
<textarea b-sync="bio"></textarea>
```

For a radio group, every radio binds to the same property; the runtime works out which one is "checked" by comparing each radio's `value` to the property.

### `b-sync` modifiers

A few small adjustments that come up often enough to deserve syntax:

```html
<input b-sync.lazy="search">              <!-- update on `change`, not on every keystroke -->
<input b-sync.trim="email">                <!-- strip leading/trailing whitespace on write -->
<input type="number" b-sync.number="age">  <!-- coerce to Number on write -->
<input b-sync.lazy.number="quantity">      <!-- modifiers stack -->
```

`.lazy` is the one I reach for most, perfect for search inputs where you don't want to fire a network request on every keypress. Pair it with a `<form b-action @submit="search()">` and you've got a search box that only commits when the user is done thinking.

### `b-sync` inside loops

It works against loop items too:

```html
<li b-for="todo in todos">
  <input type="checkbox" b-sync="todo.done">
  <input b-sync="todo.title">
</li>
```

The kind of thing that's a chore in most frameworks and a one-liner here. Each input writes back to the underlying object; the rest of the app sees the change immediately because `todos` is reactive all the way down.

## `b-html`: raw HTML

Sometimes you have a string of HTML, a markdown-rendered comment, a sanitized post body, and you actually want it parsed and inserted as DOM, not escaped.

```html
<article b-html="post.body"></article>
```

`b-html` sets `innerHTML`. **It doesn't sanitize.** If the value can contain anything an attacker controls, this is an XSS bug waiting to happen.

## `b-html.safe`: sanitized HTML

When the content is user-supplied, use the safe variant:

```html
<article b-html.safe="comment.body"></article>
```

`b-html.safe` runs the value through whatever sanitizer you've configured on `Lego.config.sanitize`. If you haven't configured one, a small built-in fallback strips the obvious vectors, `<script>`, `<iframe>`, `on*` attributes, `javascript:` URLs.

The fallback is enough to not embarrass you in a hackathon; it's not enough for production. For real apps:

```js
import DOMPurify from 'dompurify';
Lego.config.sanitize = (html) => DOMPurify.sanitize(html);
```

Set that once at startup and every `b-html.safe` in your app gets the upgrade for free.

## `b-init`: one-shot setup

Sometimes you need to run a side effect when an element first appears, but you don't want a full block for it.

```html
<canvas b-init="setupChart()"></canvas>
<section b-init="track('view', 'pricing')">…</section>
```

`b-init` runs its expression exactly once, the first time the element renders. It's the element-level equivalent of `mounted()`, useful when "block-level" is the wrong granularity (a single chart inside a larger page) or when you want the side effect attached to a specific element, not the whole component.

If the element is `b-if`'d out and comes back, that counts as a fresh init. Same for elements created inside `b-for`: each clone gets its own one-shot.

## `b-var`: DOM refs

Once in a while you need a real DOM node. To call `.focus()`. To grab a 2D context. To hand to a third-party library that wants an element.

```html
<input b-var="emailInput">
<button @click="$vars.emailInput.focus()">Edit</button>
```

The runtime collects every `b-var` in your block into `this.$vars`, keyed by the name you gave it. From JS:

```js
mounted() {
  this.$vars.emailInput.focus();
}
```

It's the escape hatch. You almost never need it for normal reactive UI work, but when you do, this is how. (Templates that use it heavily are usually a sign you're fighting the reactive model. If you find yourself reaching for `$vars` more than once a page, that's worth a second look.)

## `b-enter`: fired on viewport entry

```html
<img src="placeholder.svg" b-enter.once="loadImage()">
<div b-enter="trackImpression()">…</div>
```

An `IntersectionObserver` wearing a costume. Runs the expression when the element enters the viewport. Common uses: lazy-load below-the-fold images, fire impression analytics, kick off scroll-driven animations.

The `.once` modifier is almost always what you want, fire the first time it intersects, then disconnect the observer. Without `.once`, the expression fires every time the element enters (so scrolling past three times means the expression runs three times).

## `b-leave`: fired on viewport exit

```html
<video b-enter="play()" b-leave="pause()"></video>
```

Symmetric to `b-enter`, but fires when the element leaves the viewport (after having entered at least once, so it doesn't fire spuriously on initial layout). Same `.once` modifier behavior.

The `<video>` example is the canonical use: autoplay/pause as the user scrolls.

## `b-mount`: dynamic mounting

When you want which block to render to depend on state, not on a route, this is the directive.

```html
<div b-mount="`${activeTab}-pane`"></div>
```

```js
{
  activeTab: 'summary'   // changing this swaps the mounted block
}
```

The expression evaluates to a tag name. The runtime mounts that block as a child of the host element. Change the value, and the previous block unmounts (running `unmounted()`) and the new one mounts (running its `mounted()`).

It's the imperative twin of routing. Routes bind the URL to a tag; `b-mount` binds local state to a tag. Use it for tabs, wizard steps, anywhere "which component shows here" is a function of state.

### Clearing the host

To clear (no block mounted), the *expression* must evaluate to a falsy value, `null`, `undefined`, `""`. Watch out for template literals: `` `${activeTab}-pane` `` with `activeTab = null` produces the string `"null-pane"`, which is truthy. Guard with a short-circuit when you want a clear state:

```html
<div b-mount="activeTab && `${activeTab}-pane`"></div>
```

### Passing props with `$mount`

`b-mount` is name-only. There's no syntax for passing initial state through the directive. When you need props, drop into the JavaScript-side `$mount`:

```js
this.$mount('task-editor', '#right-pane', { task: this.selected });
```

Third argument is the props object. The runtime injects it onto the new element as `$initialState`, which the snap merges into the block's state on mount.

## How to think about it

Most directives belong to one of three families:

- **Reading state**, `[[ … ]]`, `b-text`, `b-html`.
- **Conditional rendering**, `b-if`, `b-show`, `b-for`, `b-mount`.
- **Bridging DOM and state**, `b-sync`, `b-var`, `b-init`, `b-enter`, `b-leave`.

Everything else (`b-id`, `b-logic`, `b-props`, `b-error`, `b-stylesheets`, `b-cascade`, `b-target`, `b-link`) is structural: it describes a block's shape, not what its template does at render time. Those are covered in the [Blocks](/tutorial/blocks), [Routing](/tutorial/routing), and [Error Handling](/tutorial/error-handling) guides where they belong.

If you have a feeling there *should* be a directive for something and you can't find it, the answer is often "use a getter and `[[ ]]`":

```js
{
  tasks: [...],
  filter: '',
  get visible() {
    return this.tasks.filter(t => t.title.includes(this.filter));
  }
}
```

```html
<li b-for="task in visible">[[ task.title ]]</li>
```

There's no `b-filter` or `b-sort`. There's just JavaScript, computed lazily and tracked automatically.

## Quick reference

| Directive | What it does |
|---|---|
| `[[ expr ]]` | Interpolate any expression into text or attribute |
| `b-text="path"` | Path-only text binding (rarely needed) |
| `b-show="expr"` | Toggle inline `display` |
| `b-if="expr"` | Mount/unmount based on truthiness |
| `b-for="x in xs"` | Render a clone per item; pair with `b-key="…"` for explicit keys |
| `b-sync="path"` | Two-way bind a form control. Modifiers: `.lazy`, `.number`, `.trim` |
| `b-html="expr"` | Set `innerHTML` (raw) |
| `b-html.safe="expr"` | Set `innerHTML` through `Lego.config.sanitize` |
| `b-init="expr"` | Run once on first render |
| `b-var="name"` | Capture the DOM node into `this.$vars[name]` |
| `b-enter="expr"` | Fire when element enters viewport. `.once` for one-shot |
| `b-leave="expr"` | Fire when element leaves viewport (after entering). `.once` for one-shot |
| `b-mount="expr"` | Mount the named block as a child; reactively swap on change |

Twelve directives, most of which you'll use every day. They compose freely: `b-show` inside `b-for`, `b-sync` against a loop variable, `b-html.safe` inside a `b-if` branch. There's no special interaction to memorize. They're just attributes.
