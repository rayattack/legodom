# 1. Project setup

Get a LegoDOM project running. By the end of this page you'll have a dev server with HMR and a working sample block.

## Scaffold

```bash
npm create legodom@latest task-tracker
cd task-tracker
npm install
npm run dev
```

Open `http://localhost:5173`. You should see the sample LegoDOM app — click the count button; it increments. That's a `.lego` block in action.

## What's in the project

```
task-tracker/
├── index.html              ← entry HTML
├── vite.config.js          ← Vite + LegoDOM plugin
├── package.json
└── src/
    ├── app.js              ← entry script (registers blocks, calls Lego.init)
    ├── style.css           ← global CSS (light DOM only — does not enter blocks)
    └── my-app.lego         ← sample block
```

Two things to remember:

1. **`.lego` files live anywhere under `src/`.** The Vite plugin discovers them via glob.
2. **Filename → tag.** `user-card.lego` becomes `<user-card>`. Mixed case (`UserCard.lego`) and snake case (`user_card.lego`) both kebab-case correctly. Filenames must produce a name with a hyphen.

### `src/app.js`

```js
import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';
import './style.css';

registerBlocks();
Lego.init();
```

- `virtual:lego-blocks` is a virtual module the plugin generates — importing it pulls in every `.lego` file in `src/`.
- `Lego.init()` boots the engine: hydrates inline `<template b-id>`, wires up routing, starts the auto-discovery observer (if you set `loader`), and primes `$route` from the URL.

### `index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Task Tracker</title>
  </head>
  <body>
    <my-app></my-app>
    <script type="module" src="/src/app.js"></script>
  </body>
</html>
```

The block tag (`<my-app>`) goes directly in the HTML — no mount API, no virtual root. Once `Lego.init()` runs, the custom element is upgraded.

## Verify HMR

Open `src/my-app.lego`, change the heading text, save. The change appears with no reload — the existing `<my-app>` element is unsnapped, the new template is registered, and the element is re-snapped in place.

## What `Lego.init()` actually does

In order:

1. Pre-loads any `styles` you registered (none yet).
2. If routes are registered, runs an initial route match so `$route` is correct on first paint.
3. Registers every `<template b-id>` under the root as a custom element (your `.lego` files have already done their own registration via `Lego.block`).
4. Resolves the `manifest`, if any.
5. Wires up `popstate`, `<a b-link|b-target>` clicks, and `<form b-action>` submits.
6. Starts cross-tab `$db` sync.

Most of those won't matter to you yet — they exist so that everything you'll add in later chapters just works.

## Ready

Now you have a project, a dev server, and a sample block. In the next chapter you'll throw the sample away and build the first real component of the task tracker.

[Next: Your first block →](./02-your-first-block)
