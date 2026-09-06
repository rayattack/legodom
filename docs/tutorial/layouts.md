# Layouts

You build apps with layouts because some things on screen shouldn't disappear when the URL changes. A sidebar. A header. A notification bar. The user's profile menu in the corner. Routing alone doesn't get you there. The router can swap the middle of the page; the rest needs somewhere to live.

In LegoDOM, a layout is just a block. A block whose template has a `<slot>`. Whatever you wrap with that block ends up in that slot, and the rest of the block (chrome, sidebar, whatever) sits around it.

That's the whole concept. The patterns on this page are different ways of arranging slots and blocks to do useful things.

## Your first layout

The simplest possible layout, no styling, no router yet.

```html
<!-- src/page-shell.lego -->
<template>
  <header>
    <h1>My App</h1>
    <nav>
      <a href="/" b-link>Home</a> ·
      <a href="/about" b-link>About</a>
    </nav>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>© 2026</footer>
</template>
```

```html
<!-- index.html -->
<page-shell>
  <h1>Hello world</h1>
  <p>This goes in the slot.</p>
</page-shell>
```

The `<h1>` and `<p>` you wrote inside `<page-shell>` get projected into the `<slot>` position. The header, footer, and nav come from the shell. Change what's between the tags; the chrome stays put.

If you understand this snippet, you understand layouts. The rest of this guide is shapes and corners.

## Slots stay in the light DOM

Here's the part that trips people up. When you wrap a block around content like this:

```html
<page-shell>
  <user-profile></user-profile>
</page-shell>
```

the `<user-profile>` does **not** move into `page-shell`'s shadow DOM. It stays as an ordinary light-DOM child of `<page-shell>`. The browser projects it visually into the slot position, but logically it's still right there in the document tree.

Three reasons that matters:

1. **`<user-profile>` keeps its own state.** It's a separate block with its own shadow DOM and its own reactive proxy. The shell can't reach into it; that's the encapsulation working as designed.
2. **CSS selectors from outside still apply.** Light DOM means `document.querySelector('user-profile')` finds it. Anything that operates on the document tree treats it as a normal child of `<page-shell>`.
3. **Routing finds it.** `<lego-router>` slotted into a shell still works, because the router resolves its target as `document.querySelectorAll('lego-router')` and the slotted element is in the document tree.

That last point is why the next pattern works at all.

## Where the router goes

The most common layout pattern: wrap your router in a shell.

```html
<!-- src/app-shell.lego -->
<template>
  <header><app-nav></app-nav></header>
  <main><slot></slot></main>
</template>
```

```html
<!-- index.html -->
<body>
  <app-shell>
    <lego-router></lego-router>
  </app-shell>
  <script type="module" src="/src/app.js"></script>
</body>
```

When the URL changes, the router swaps whatever block lives inside `<lego-router>`. The shell, with its header and `<app-nav>`, doesn't reload. Anything stateful in `<app-nav>` (an open menu, a search input, scroll position) stays put.

You don't need a "nested route" or a "layout route" or any of the matching vocabulary from other frameworks. The DOM is the layout config. If you want a page rendered inside a layout, put the layout around the router.

## Named slots

When a layout has more than one place to plug things in, give the slots names.

```html
<!-- src/dashboard-layout.lego -->
<template>
  <div class="dashboard">
    <header><slot name="header"></slot></header>
    <nav><slot name="sidebar"></slot></nav>
    <main><slot name="content"></slot></main>
  </div>
</template>
```

```html
<dashboard-layout>
  <user-profile slot="header"></user-profile>
  <nav-menu     slot="sidebar"></nav-menu>
  <lego-router  slot="content"></lego-router>
</dashboard-layout>
```

Each child carries a `slot` attribute that says where it should land. A nameless `<slot></slot>` in the layout catches anything you didn't explicitly assign.

This is a native Web Components feature, not a LegoDOM addition. Slots are part of the platform.

## Sharing styles across layout boundaries

By default every block has its own scoped styles via Shadow DOM (a block can opt out with `shadow: false`). Usually that's what you want, but layouts are an exception: design tokens, resets, and utility frameworks should be available in every block they wrap.

The combination is `b-stylesheets` plus `b-cascade`:

```html
<template b-stylesheets="tokens utilities" b-cascade="tokens utilities">
  <header>...</header>
  <main><slot></slot></main>
</template>
```

`b-stylesheets="tokens utilities"` adopts those named stylesheets into the layout's own shadow DOM. `b-cascade="tokens utilities"` says "also propagate them to every descendant block, including ones that come in through slots". The names refer to entries you registered up front:

```js
await Lego.init(document.body, {
  styles: {
    tokens:    ['/styles/tokens.css'],
    utilities: ['/styles/utilities.css']
  }
});
```

See [`b-stylesheets`](/api/directives#b-stylesheets) and [`b-cascade`](/api/directives#b-cascade) for the full mechanics. The thing to remember is: cascade only the styles that should genuinely be global. Block-specific styles belong inside that block, not on the layout.

## Auth wrapper

Layouts compose. You can stack one inside another, and a layout can decide whether to render its slot at all. That's the recipe for an auth gate.

```html
<!-- src/auth-guard.lego -->
<script>
export default {
  user: $db('user').default(null)
}
</script>

<template>
  <div b-if="user">
    <slot></slot>
  </div>
  <login-page b-if="!user"></login-page>
</template>
```

```html
<!-- index.html -->
<body>
  <auth-guard>
    <app-shell>
      <lego-router></lego-router>
    </app-shell>
  </auth-guard>
</body>
```

When `user` is null, the wrapping div is removed, the slot has no place to project into, and `<login-page>` renders instead. As soon as login succeeds and you set `user` (typically via `Lego.db('user').set(token)`), the b-if flips and the slotted app comes in.

Because `user` is bound to `$db`, the auth state survives refresh and syncs across tabs automatically.

::: tip Logged-out blocks aren't unmounted, just hidden
The slotted `<app-shell>` and `<lego-router>` stay in the document tree the whole time. They're just invisible while the slot has no projection target. For most apps that's fine; for stricter teardown (a logged-out user shouldn't have a half-fetched dashboard sitting in memory), separate the two trees explicitly with `b-if` rather than relying on slot projection.
:::

## Nested layouts

A settings area that needs its own internal navigation can wrap its content in a sub-layout:

```html
<auth-guard>
  <app-shell>
    <settings-layout>
      <lego-router></lego-router>
    </settings-layout>
  </app-shell>
</auth-guard>
```

`<settings-layout>` has its own shadow DOM with its own slot, perhaps a settings sidebar next to a content area. The router still sits at the bottom and swaps as the URL changes; now it's wrapped in two layouts and an auth gate.

There's no special vocabulary for this. Each layer is just a block with a slot, and the HTML you write is the configuration.

## How to think about it

Most layout questions reduce to two ideas:

1. **A layout is a block with a `<slot>`.** Whatever you wrap with it lands in the slot.
2. **Slotted children stay in the light DOM.** They keep their own state, their own shadow DOM, and they're findable from outside. The slot is a visual projection, not a change in parentage.

If you can answer "what's the slot, and what goes in it" for any layout you're building, you've solved the structural problem. Styling, routing, and reactivity all flow through the same primitive.

## Quick reference

| Goal | Pattern |
|---|---|
| Static chrome around content | One block with `<slot></slot>` |
| Multi-pane layout | Multiple `<slot name="...">` plus `slot="..."` on children |
| Persistent shell wrapping routes | `<shell><lego-router></lego-router></shell>` |
| Conditional gating (auth, feature flags) | Wrap `<slot>` in a `b-if` div |
| Layouts inside layouts | Just nest them in HTML |
| Share styles into wrapped blocks | `b-stylesheets="x" b-cascade="x"` on the layout |
| Where slotted children "live" | Light DOM, still under `<wrapper>` in the document tree |

That's the whole story. One tag, two attributes for styling, and the rest is HTML composition.
