# Routing

You don't reach for a router because URLs are interesting. You reach for one because you want a real app — pages that bookmark, a back button that works, and a UI that doesn't tear itself down every time the user clicks something.

LegoDOM's router is small, but it has one trick most routers don't: it doesn't insist on owning the whole page. You decide which parts of the screen follow the URL and which parts persist across navigation. Once that clicks, building complex layouts gets a lot less complicated.

We'll build up to that. Start simple.

## The simplest router

Two pages, one outlet:

```js
// src/app.js
Lego.route('/',      'home-page');
Lego.route('/about', 'about-page');
Lego.init();
```

```html
<!-- index.html -->
<body>
  <nav>
    <a href="/"      b-link>Home</a>
    <a href="/about" b-link>About</a>
  </nav>

  <lego-router></lego-router>
</body>
```

That's a working SPA. Click "About" — the URL becomes `/about`, the `<lego-router>` swaps to `<about-page>`, the back button still works, and you can refresh the page on `/about` and land back on the same view.

Two things happened that are worth noticing:

1. **`b-link`** turned an ordinary `<a>` into a client-side link. No JS required.
2. **`<lego-router>`** is the outlet. When the URL changes, that's where the new page goes.

You'll meet `b-target` next, but you won't always need it. For a lot of apps, this is enough.

## So what's `<lego-router>`, really?

It's not magic. It's a tag name LegoDOM looks for when nothing else is specified. When you click `<a b-link>`, the runtime asks the question "where does this go?" — and if you didn't tell it, it scans the page for `<lego-router>` elements and renders into them.

Three useful consequences:

- You can have **more than one** `<lego-router>`. They all get swapped on the same navigation.
- You can have **none** — but then you have to point every link at a specific selector with `b-target`, and you have to handle cold entry yourself (the first render after a refresh).
- Adding `id="main"` does nothing for routing on its own — but it lets you also address the same outlet surgically when you need to: `<a href="/x" b-target="#main">`.

If your whole app is one `<lego-router>`, you can stop reading. The rest of this guide is about the moment you realize you don't want everything to swap.

## The first time you want something to *not* reload

Picture an editor: a file tree on the left, an editor in the middle, a properties panel on the right. The user clicks a file in the tree. You want the editor to load that file — but the tree shouldn't repaint, scroll back to the top, and forget which folders were open.

The fix is one attribute:

```html
<a href="/files/budget.txt" b-target="#editor">budget.txt</a>
```

Now when that link fires, only `#editor` changes. The tree, its scroll position, every expanded folder — all untouched. That's surgical routing, and it's the whole reason the router exists.

Where does the URL come in? It's still updated — `b-target` doesn't change history behaviour by default. You can refresh, share the link, hit back. Only the *render target* moved.

## A real layout

Let's put the pieces together. A three-panel app where each panel has its own job:

```html
<!-- inside app-shell.lego -->
<aside id="left">
  <file-tree></file-tree>
</aside>

<lego-router id="main"></lego-router>

<aside id="right">
  <inspector-panel></inspector-panel>
</aside>
```

```html
<!-- inside file-tree.lego -->
<a href="/files/budget.txt" b-target="#main">budget.txt</a>
<a href="/files/notes.md"   b-target="#main">notes.md</a>
```

The middle panel is the URL-bound stage. The two sides persist. When you load `/files/notes.md` cold (a refresh), the runtime's first render hits `<lego-router>` (the default), the right block lands in the middle. The sides keep whatever was hardcoded into the shell.

That last part is the trap people hit: **cold entry uses the default outlet**. If you only ever route with `b-target="#main"`, your `/files/notes.md` URL works on click but breaks on refresh. The fix is what we already did — make the URL-bound region a `<lego-router>` (with whatever `id` you want) so the default and the surgical addresses point at the same place.

## The case for a silent route

Sometimes you want surgical updates that don't change the URL at all. Tabs in a side panel are the classic example — useful UI, but you don't want each tab click polluting the back-button history.

```html
<a href="/tools/inspector" b-target="#right" b-link="false">Inspector</a>
<a href="/tools/history"   b-target="#right" b-link="false">History</a>
```

`b-link="false"` says "swap the target, leave the URL alone". Routes still match, blocks still mount, but `history.pushState` is skipped. Bookmarking the page won't capture which tab was open — by design. You're treating routes here as a clean way to *name* views, not as URLs.

## Doing it from JavaScript

Sometimes a click handler isn't enough — maybe you want to navigate after a network call finishes, or you're handling a keyboard shortcut. The function is `$go`:

```js
this.$go('/profile').get();                       // default outlet, push history
this.$go('/tools/inspector', '#right').get(false); // surgical, silent
this.$go('/orders/42', '#main', '#right').get();   // two outlets at once
```

Same model as the link attributes — first arg is the path, the rest are selectors, and the verb on the end (`.get()`, `.post(data)`, …) is what actually fires the navigation. The boolean is the history flag.

That last form is worth lingering on: `$go(path, '#main', '#right').get()` swaps **two** regions for the same route. Most of the time you won't need it. The day you do — say, an order list where clicking a row should populate both the main view and a contextual sidebar — it's there.

## Route parameters

Routes can capture URL segments:

```js
Lego.route('/files/:name', 'file-viewer');
```

```js
// inside file-viewer.lego
mounted() {
  console.log(this.$route.params.name); // 'budget.txt'
}
```

`$route.params` is reactive. If your file viewer is reading `[[ $route.params.name ]]` in its template, navigating from `/files/a.txt` to `/files/b.txt` re-renders just the bindings that read it. The block doesn't even unmount.

Wildcards work too — `Lego.route('/docs/*', 'docs-page')` catches `/docs/anything/at/all`. Use `'*'` alone as a 404 catch-all (register it last, so it loses to specific routes).

## Guards

Some routes shouldn't be reachable. A middleware function can vote on every navigation:

```js
const requireAuth = ({ path, params }) => {
  if (!Lego.globals.user) {
    Lego.globals.$go('/login').get();
    return false;   // abort the original navigation
  }
  return true;
};

Lego.route('/admin',         'admin-page',   requireAuth);
Lego.route('/account/:tab',  'account-page', requireAuth);
```

Three things to know:

- The middleware can be **async**. Return a promise of a boolean.
- A faster navigation that arrives mid-await wins. The slow one's verdict is silently discarded — no race conditions where two clicks each commit half a swap.
- The middleware can redirect (call `$go` somewhere else, then return `false`) and the new navigation cleanly takes over.

This is enough for the common cases — auth gates, role checks, "are you sure you want to leave this form" prompts.

## How to think about it

If you take one mental model away from this page, take this one:

> A route is a path → block mapping. Where that block lands on the page is a separate decision, made by whoever fires the navigation.

That's why the same route can render into a `<lego-router>` from one link and into `#sidebar` from another. The route doesn't know. It's a clean separation, and once you stop thinking of routing as "the page changes", you start designing apps where most of the screen never has to.

## When to use what

A small heuristic for deciding:

- **One main view, no fixed chrome you care about?** One `<lego-router>`, every link is `b-link`. Done.
- **Persistent sidebar / chrome that shouldn't reload?** Make the changing part a `<lego-router>`, leave the rest in the shell. Same as above — no extra effort.
- **Two regions that change together with the URL?** Multiple `<lego-router>` elements (or `b-target="#a #b"` on the link).
- **A region you want to swap by route name without touching the URL?** `b-target` + `b-link="false"`. Treat the route as a label.
- **Deep links that need to populate both default and surgical regions on cold entry?** Either give the surgical regions IDs and route into them with `b-target` from the cold-entry render, or seed them from the shell's `mounted()` with `$go(this.$route.url, '#somewhere').get(false)`.

## Quick reference

If you came back to this page looking up a syntax, here's the one table:

| You want… | Code |
|---|---|
| Default link (renders into every `<lego-router>`) | `<a href="/x" b-link>` |
| Render into a specific region | `<a href="/x" b-target="#id">` |
| Render into a region without changing the URL | `<a href="/x" b-target="#id" b-link="false">` |
| Render into multiple regions for one click | `<a href="/x" b-target="#a #b">` |
| Same things, from JS | `this.$go('/x', '#a', '#b').get(/* push? */)` |
| Read URL params | `this.$route.params.id` |
| Read query string | `this.$route.query.tab` |
| Catch-all (404) | `Lego.route('*', 'not-found')` (last) |
| Guard a route | `Lego.route('/admin', 'admin', ({path, params}) => …)` |

That's the whole router. Two attributes, one function, one outlet tag. Everything else is just a different combination of those four pieces.
