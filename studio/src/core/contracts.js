/**
 * Lego Studio - frozen contracts.
 *
 * Every other module in the studio codes against the shapes and constants in
 * this file. Nothing here may be changed without changing every consumer, so
 * treat it as the seam: implementations move, this does not.
 *
 * Three producers, one shape:
 *   discover.js  -> Manifest      (Node, from .lego files on disk)
 *   stories.js   -> Story[]       (Node, per block)
 *   render.js    -> HTML string   (Node, via lego-dom/server)
 *
 * The manager (parent frame) and the preview (iframe) never share memory.
 * They exchange the messages listed under PROTOCOL, and nothing else.
 */

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} PropDescriptor
 * @property {string} name          - camelCase prop name, as state sees it
 * @property {string} attr          - kebab-case attribute name
 * @property {?string} type         - 'String'|'Number'|'Boolean'|'Array'|'Object'|'Function'|null
 * @property {?string} defaultSource - the raw default expression text, or null
 * @property {*} defaultValue       - the evaluated default, or undefined
 * @property {string} control       - widget hint: 'text'|'number'|'boolean'|'json'|'select'
 */

/**
 * @typedef {object} BlockInfo
 * @property {string} tag           - custom element name
 * @property {string} file          - absolute path to the .lego file
 * @property {string} relFile       - path relative to the studio root
 * @property {boolean} shadow       - false for `b-shadow="false"` blocks
 * @property {boolean} form         - true for `b-form` blocks
 * @property {string} template      - the block's markup
 * @property {string} css           - the block's own <style> text
 * @property {string} script        - the block's <script> source text
 * @property {string} propsAttr     - the raw b-props attribute string
 * @property {PropDescriptor[]} props
 * @property {string[]} stateKeys   - non-function, non-$ logic keys not declared as props
 * @property {string[]} methodKeys  - function-valued logic keys
 * @property {string[]} emits       - event names found in `$emit('x')` calls
 * @property {string[]} slots       - slot names ('' for the default slot)
 * @property {string[]} children    - registered block tags referenced in the template,
 *   including the block's own tag when it recurses, which is a legal pattern
 * @property {string[]} storyFiles  - absolute paths of sibling story modules that
 *   contributed stories, so a consumer computing what a changed file affects
 *   never has to guess the naming convention back from a basename
 * @property {Story[]} stories      - always at least one (the implicit Default)
 */

/**
 * @typedef {object} Manifest
 * @property {string} root          - absolute directory the scan was rooted at
 * @property {Record<string, BlockInfo>} blocks - keyed by tag
 * @property {string[]} order       - tags, sorted, for stable iteration
 * @property {string[]} errors      - human readable parse failures
 */

/* ------------------------------------------------------------------ *
 * Stories
 * ------------------------------------------------------------------ */

/**
 * A story is one named rendering of one block. Every block has at least the
 * implicit `Default` story, whose args are empty: the block's own b-props
 * defaults supply the values, which is the point - nothing is authored until
 * a second variant is wanted.
 *
 * @typedef {object} Story
 * @property {string} id            - `${block}--${slug(name)}`, stable and URL safe
 * @property {string} block         - tag name
 * @property {string} name          - display name, e.g. 'Loading'
 * @property {Record<string, *>} args    - prop name -> value, layered over defaults
 * @property {Record<string, string>} slots - slot name ('' = default) -> HTML
 * @property {Record<string, *>} globals  - what templates read as `global`
 * @property {?object} route        - what `$route` resolves to
 * @property {'implicit'|'lego'|'file'} source - where the story came from
 */

/** Slug a story name into the id segment. Must match on both sides of the wire. */
export const slugify = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'story';

/** The canonical story id. The only place ids are built. */
export const storyId = (block, name) => `${block}--${slugify(name)}`;

/** The name every block's zero-config story carries. */
export const DEFAULT_STORY_NAME = 'Default';

/* ------------------------------------------------------------------ *
 * Manager <-> preview protocol
 * ------------------------------------------------------------------ */

/**
 * Messages are plain objects: `{ type, ...payload }`, sent with postMessage
 * and always targeted at '*' (both frames are same-origin dev server pages;
 * the preview verifies `event.source === window.parent` instead).
 *
 * Every payload must survive structuredClone. Args carrying functions are a
 * caller error: strip them before sending.
 */
export const PROTOCOL = {
  /** preview -> manager: the runtime booted and registered its blocks. */
  READY: 'lego-studio:ready',
  /** manager -> preview: mount this story from scratch. `{ story }` */
  RENDER: 'lego-studio:render',
  /** manager -> preview: live-write args onto the mounted block. `{ args }` */
  ARGS: 'lego-studio:args',
  /** manager -> preview: unmount and mount again, same story. */
  REMOUNT: 'lego-studio:remount',
  /** manager -> preview: `{ theme: 'light'|'dark', background: string }` */
  THEME: 'lego-studio:theme',
  /** preview -> manager: mount finished. `{ storyId, error }` */
  RENDERED: 'lego-studio:rendered',
  /** preview -> manager: a CustomEvent crossed the mount. `{ name, detail, time }` */
  ACTION: 'lego-studio:action',
  /** preview -> manager: the block's serialisable state. `{ storyId, state }` */
  STATE: 'lego-studio:state',
  /** preview -> manager: console output or a thrown error. `{ level, text }` */
  LOG: 'lego-studio:log',
  /** manager -> preview: serialise the mounted block's DOM as it now stands. */
  SERIALIZE: 'lego-studio:serialize',
  /**
   * preview -> manager: the answer. `{ storyId, html }`
   *
   * This is how hydration verification gets its client half. The server half
   * comes from renderToString over the same definitions, so the two strings
   * are directly comparable and their diff is a real server/client divergence
   * rather than a guess.
   */
  SERIALIZED: 'lego-studio:serialized',
  /** manager -> preview: the manifest changed on disk; re-read it. */
  INVALIDATE: 'lego-studio:invalidate'
};

/* ------------------------------------------------------------------ *
 * Snapshots
 * ------------------------------------------------------------------ */

/** Where `lego studio snap` writes, relative to the studio root. */
export const SNAPSHOT_DIR = '__snapshots__';

/** One snapshot file per story: `__snapshots__/<block>/<slug>.html`. */
export const snapshotPath = (block, name) => `${block}/${slugify(name)}.html`;

/**
 * @typedef {object} SnapResult
 * @property {'written'|'unchanged'|'changed'|'added'|'removed'|'error'} status
 * @property {string} storyId
 * @property {string} file          - path relative to the snapshot dir
 * @property {?string} diff         - unified diff when status is 'changed'
 * @property {?string} error
 */

/* ------------------------------------------------------------------ *
 * Graph
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} BlockGraph
 * @property {string[]} nodes                    - tags
 * @property {Array<[string,string]>} edges       - [parent, child]
 * @property {Record<string,string[]>} dependents - tag -> tags that use it, transitively
 * @property {Record<string,string[]>} dependencies - tag -> tags it uses, transitively
 * @property {string[][]} cycles                  - each cycle as a tag list
 *
 * A tag never appears in its own `dependents` or `dependencies`, even when it
 * recurses. Self-reachability is real information, but putting it in the
 * closures would make every consumer filter the tag back out; read `cycles`
 * instead, which is where a recursive block shows up.
 */

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/**
 * The widget a prop descriptor should render as. Single source of truth so the
 * Node side and the manager never disagree.
 */
export const controlFor = (type) => {
  switch (type) {
    case 'Number': return 'number';
    case 'Boolean': return 'boolean';
    case 'Array':
    case 'Object': return 'json';
    case 'Function': return 'none';
    default: return 'text';
  }
};

/** Strip anything that cannot cross postMessage or land in a snapshot. */
export const serialisable = (value, seen = new Set()) => {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
  }
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(v => serialisable(v, seen));
  const out = {};
  for (const key of Object.keys(value)) {
    if (key.startsWith('$')) continue;
    const next = serialisable(value[key], seen);
    if (next !== undefined) out[key] = next;
  }
  return out;
};
