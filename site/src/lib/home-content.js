// What the home page shows. Kept out of home-page.lego because some of it is
// .lego source, and a closing script tag inside a block's own script section
// would end that section early.
import { sceneSVG } from './iso.js';
import { spotSVG } from './spot-art.js';

// Paint order: back to front, bottom to top.
export const heroArt = sceneSVG([
  { x: 0, y: 0, z: 0, w: 4, d: 4, h: 1, color: 'ink', studs: false },
  { x: 0, y: 0, z: 1, w: 4, d: 2, h: 3, color: 'blue' },
  { x: 0, y: 2, z: 1, w: 2, d: 2, h: 3, color: 'red' },
  { x: 2, y: 2, z: 1, w: 2, d: 2, h: 3, color: 'green' },
  { x: 0, y: 0, z: 4, w: 2, d: 2, h: 3, color: 'yellow' },
  { x: 2, y: 1, z: 4, w: 2, d: 2, h: 3, color: 'cream' },
  { x: 0, y: 2, z: 4, w: 2, d: 2, h: 1, color: 'blue' },
  { x: 1, y: 0, z: 7, w: 2, d: 2, h: 3, color: 'red' }
], { animate: true, label: 'A stack of coloured bricks' });

export const stairArt = sceneSVG([
  { x: 0, y: 0, z: 0, w: 2, d: 2, h: 15, color: 'ink' },
  { x: 2, y: 0, z: 0, w: 2, d: 2, h: 12, color: 'green' },
  { x: 4, y: 0, z: 0, w: 2, d: 2, h: 9, color: 'blue' },
  { x: 6, y: 0, z: 0, w: 2, d: 2, h: 6, color: 'red' },
  { x: 8, y: 0, z: 0, w: 2, d: 2, h: 3, color: 'yellow' }
], { label: 'Five towers of bricks rising like steps' });

export const courseArt = sceneSVG([
  { x: 0, y: 0, z: 0, w: 6, d: 2, h: 1, color: 'ink', studs: false },
  { x: 0, y: 0, z: 1, w: 2, d: 2, h: 3, color: 'yellow' },
  { x: 2, y: 0, z: 1, w: 2, d: 2, h: 3, color: 'red' },
  { x: 4, y: 0, z: 1, w: 2, d: 2, h: 3, color: 'blue' },
  { x: 1, y: 0, z: 4, w: 2, d: 2, h: 3, color: 'green' },
  { x: 3, y: 0, z: 4, w: 2, d: 2, h: 3, color: 'cream' }
], { label: 'Bricks stacked in two rows' });

export const demo = {
  'index.html': `<brick-counter></brick-counter>
<brick-counter></brick-counter>
`,
  'brick-counter.lego': `<template>
  <button @click="count++">
    Clicked [[ count ]] [[ count === 1 ? 'time' : 'times' ]]
  </button>
  <p b-if="count >= 5">That is [[ count * 8 ]] studs.</p>
</template>

<script>
export default {
  count: 0
}
</script>

<style>
  self { display: block; margin-bottom: 14px; }

  button {
    padding: 12px 20px;
    border: 2px solid #14161f;
    border-radius: 12px;
    background: #ffd43b;
    box-shadow: 4px 4px 0 #14161f;
    font-weight: 700;
    cursor: pointer;
  }
  button:active { transform: translate(3px, 3px); box-shadow: none; }
</style>
`
};

export const facts = [
  { value: '23 KB', label: 'min + gzip, all features', tone: 'yellow' },
  { value: '0', label: 'runtime dependencies', tone: 'red' },
  { value: '0', label: 'build steps required', tone: 'blue' },
  { value: '1', label: 'file per block', tone: 'green' }
];

export const anatomy = [
  {
    tone: 'yellow',
    tag: '<template>',
    title: 'Markup',
    text: 'Plain HTML. Double brackets read state, @ listens for events and b- attributes handle loops, conditions and inputs.',
    code: `<template b-props="label = 'Save'">
  <button @click="press()">
    [[ label ]] ([[ presses ]])
  </button>
</template>`
  },
  {
    tone: 'red',
    tag: '<script>',
    title: 'State and logic',
    text: 'One exported object. Its properties are reactive state, its methods are handlers, its getters are derived values.',
    code: `<script>
export default {
  presses: 0,
  press() { this.presses++; }
}
</script>`
  },
  {
    tone: 'blue',
    tag: '<style>',
    title: 'Scoped CSS',
    text: 'Shadow DOM keeps these rules inside the block. Style a bare button and no other button on the page notices.',
    code: `<style>
  self { display: inline-block; }
  button { border-radius: 10px; }
</style>`
  }
];

export const features = [
  { art: 'tag', tone: 'yellow', title: 'No imports', text: 'Name a file user-card.lego and write <user-card> wherever you want one. The runtime registers a real custom element.' },
  { art: 'reactive', tone: 'green', title: 'Plain reactivity', text: 'Assign to a property and the page follows. No setState, no hooks, no dependency arrays, no .value.' },
  { art: 'direct', tone: 'red', title: 'No virtual DOM', text: 'Each binding knows what it read. A write re-runs those bindings and nothing else, with no tree to diff.' },
  { art: 'route', tone: 'blue', title: 'Surgical routing', text: 'A link can swap one region of the page. Sidebars, scroll positions and half-filled forms survive navigation.' },
  { art: 'persist', tone: 'green', title: 'One-line persistence', text: 'Declare a value with $db and it survives a reload and stays in step across tabs.' },
  { art: 'server', tone: 'yellow', title: 'Server rendering', text: 'Render the same blocks to HTML in Node, then hydrate in the browser without rewriting a single node.' },
  { art: 'stack', tone: 'ink', title: 'Fits any stack', text: 'Blocks are web components. Use one inside React, Vue, Svelte or a static page, or build the whole app from them.' },
  { art: 'tag', tone: 'blue', title: 'This site is the proof', text: 'Every page here, the editor included, is a LegoDOM block. View source, or read the site folder in the repository.' }
].map(feature => ({ ...feature, svg: spotSVG(feature.art) }));
