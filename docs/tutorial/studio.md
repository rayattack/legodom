# Lego Studio

Lego Studio is a workshop for your blocks. It browses them, renders each one in
isolation, generates typed controls from `b-props` with nothing authored, logs
the events a block emits, snapshots every rendering to HTML you can review in a
pull request, draws the composition graph, and tells you when the server render
and the client render disagree.

It is a command, not a runtime option:

```bash
npx lego-studio
```

There is no `studio: true` any more. The old option side-loaded a pinned script
from a CDN into your running application, which is not a thing a development
tool should ask of a production bundle.

---

## Quick start

From a project with `.lego` files anywhere under it:

```bash
npx lego-studio           # http://localhost:6006
npx lego-studio --root ./src -p 4321
```

Studio scans for `.lego` files, registers every block it finds, and serves two
pages: the manager at `/`, and the preview at `/preview`. The preview is a real
iframe with its own document, so a block that opts out of Shadow DOM with
`b-shadow="false"` gets its scoped styles in a head that is actually its own,
and nothing a previewed block does can reach your studio chrome.

`.lego` files hot reload. Redefining a block re-snaps every live instance,
including the one on the stage.

---

## Stories

Every block is already a story. There is no file to write, no `argTypes` to
declare, and no decorator to register: Studio reads the block's `b-props`
contract and renders it with its own declared defaults under the name
`Default`.

Write a story only when you want a second rendering. Put it next to the block,
in the same file:

```html
<template b-props="label: String = 'Save', busy: Boolean, variant: String = 'primary'">
  <button class="button button--[[ variant ]]" @click="press()">
    <span b-if="busy" class="button__spinner"></span>
    <span class="button__label">[[ label ]]</span>
    <slot></slot>
  </button>
</template>

<story name="Busy" args="{ busy: true, label: 'Saving' }"></story>

<story name="Danger" args="{ variant: 'danger', label: 'Delete' }">
  <small>This cannot be undone</small>
</story>
```

A `<story>` takes three attributes and its content:

| | |
|---|---|
| `name` | display name, and the basis of the story id |
| `args` | an expression, evaluated by the same compiler your templates use |
| `globals` | an expression, supplying what templates read as `global` |
| content | slot content, with `slot="name"` on a child for a named slot |

`<story>` sections never reach production. The parser lifts them out of the
file and the Vite plugin does not emit them.

For stories that need real JavaScript, add a sibling `<tag>.stories.js`:

```js
export default {
  'Long list': { args: { items: Array.from({ length: 50 }, (_, i) => ({ id: i })) } }
};
```

---

## Controls

The Controls panel is generated from `b-props` and nothing else.

```
b-props="label: String = 'Save', count: Number = 0, items: Array = [], busy: Boolean"
```

gives you a text input, a number input, a JSON editor and a checkbox, each
labelled with its declared type and its default, and each marked when it
differs from that default. Editing one writes the value straight onto the live
block's reactive state, so the change is a real state mutation and not a
remount.

Props you have not declared appear underneath, read only, under **State
(undeclared)**. Those are logic keys nothing outside the block can write.
Declaring one in `b-props` turns it into a control.

This is the part that is hard to copy. Other workshops need a per-framework
docgen compiler pass to recover prop metadata, and their users still hand-write
`argTypes` on top of it. LegoDOM parses a real prop contract at runtime, so the
controls are free and always correct.

---

## Snapshots

```bash
npx lego-studio snap              # write the baseline
npx lego-studio snap --check      # fail if anything moved
npx lego-studio snap --update     # accept the new output
```

Every story is rendered through `lego-dom/server` into
`__snapshots__/<block>/<story>.html` and committed. No browser is started, no
screenshots are taken, and nothing is uploaded, because the server renderer and
the client run from one definition registry: the HTML is the real output, not a
picture of it.

The point is the diff. A snapshot is readable markup, so a change shows up in
review as the lines that changed:

```diff
   <span class="badge badge--brand">
     Unread
-    <b b-if="count > 0" class="badge__count">4</b>
+    <b b-if="count > 0" class="badge__tally">4</b>
   </span>
```

`--check` exits 1 when anything is added, changed or removed. That is your CI
gate.

### Only what changed

```bash
npx lego-studio snap --check --affected --base origin/main
```

`--affected` renders only the stories a git diff can have reached. Studio knows
which blocks each block composes, because a block's markup is a string it can
read, so changing a button re-renders every story of every block that uses that
button, at any depth, and nothing else.

It fails open on purpose. A changed file that is not a `.lego` or a
`.stories.js`, a deleted block, a block outside the include glob, or an
unusable git diff all widen the answer back to everything, and the run says
which file caused it. Under-snapshotting silently is the one outcome worth
avoiding.

---

## The graph

```bash
npx lego-studio graph
npx lego-studio graph --json
npx lego-studio graph --svg blocks.svg
npx lego-studio graph --affected
```

```
ui-panel
|- ui-avatar
|- ui-badge
|- ui-button
`- ui-card
ui-stat
ui-tree
`- ui-tree (cycle)

7 blocks, 5 edges, 1 cycle

cycles:
  ui-tree -> ui-tree
```

The graph is exact rather than inferred from bundler statistics. A block that
renders its own tag is a legal pattern, so recursion is reported as a cycle and
marked, not treated as an error.

---

## Hydration

The Hydration panel renders the selected story on the server, asks the preview
for the DOM it actually produced, and diffs them. Very few frameworks can do
this honestly, because it needs one definition registry driving both renderers
in one process, which is exactly what `getDefinitions()` and `lego-dom/server`
give you.

It found four real divergences the first time it ran on this repository's own
fixtures, including one where the client rendered a story's slot children in a
different order than the server.

```bash
npx lego-studio hydrate
```

The command validates the server's output contract without a browser: every
`b-hydrate` host resolves to a real definition, shadow blocks lead with
`<template shadowrootmode>`, light blocks carry a de-duplicable
`data-lego-style`, and every `b-for` anchor is followed by keyed rows. It says
on every run what it did not check. Markup drift is `snap --check`'s job, and
the client half needs the panel.

---

## Static build

```bash
npx lego-studio build --out dist-studio
```

A deployable studio with the manifest inlined and every story pre-rendered, so
the hydration panel keeps working with no server behind it.

---

## Theme

The manager follows your system theme, and the System / Light / Dark control in
the canvas toolbar overrides it.

The preview is deliberately not the same. It defaults to a white page whatever
your operating system says, and only goes dark when you choose Dark. The
preview is showing your blocks, so its background is part of what you are
inspecting: a canvas that silently repaints itself because of an OS setting is
misreporting what your component looks like.

---

## Commands

| | |
|---|---|
| `lego-studio [dev]` | the workshop, with hot reload |
| `lego-studio snap` | render every story to committed HTML |
| `lego-studio graph` | the block composition graph |
| `lego-studio hydrate` | check the server output contract |
| `lego-studio build` | a static, deployable studio |

Common options: `--root`, `--include`, `--exclude`, `--only`, `--affected`,
`--base`, `--out`, `-p/--port`, `--open`.

---

## If you would rather use Storybook

You can. LegoDOM blocks are ordinary custom elements, so
`@storybook/web-components` renders them with a normal CSF file. You give up
the things on this page that come from LegoDOM knowing about itself: controls
with no docgen step, snapshots with no browser, an exact composition graph, and
hydration checking. You gain the addon ecosystem. Both are reasonable.
