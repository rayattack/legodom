/**
 * Build a configuration object. Every app owns one: two apps on a page may
 * disagree about the delimiter syntax, strict mode or the error handler, so
 * the defaults have to be minted per app rather than shared.
 *
 * `metrics` in particular must be a fresh object each time, or a monitoring
 * plugin installed on one app would report the other app's renders too.
 *
 * @param {object} [overrides] - values merged over the defaults
 * @returns {object} a new config object
 */
export const createConfig = (overrides = {}) => Object.assign({
  onError: (err, type, el) => {
    console.error(`[Lego Error] [${type}]`, err, el);
  },
  metrics: {},   // Performance hooks
  debug: false,
  syntax: 'brackets', // 'brackets' ([[ ]]) or 'mustache' ({{ }})
  // User-supplied sanitizer for b-html.safe. Receives the raw HTML string,
  // returns the cleaned HTML. If null, b-html.safe falls back to a small
  // built-in sanitizer (script/iframe/event-handler/javascript: stripping).
  // Set this to DOMPurify.sanitize for production-grade cleaning.
  sanitize: null,
  // Auto-discovery: if set, only tag names matching this pattern (or any of
  // these patterns when given an array) will be fetched. Default null = no
  // allowlist; a console warning is emitted on first use.
  loaderAllowlist: null,
  // Fetches the source of an unknown hyphenated tag. Set by init().
  loader: null,
  // Opt-in stricter runtime safety: re-throws undefined-identifier
  // ReferenceErrors instead of rendering '', and drops dangerous-scheme
  // (javascript:/data:text/html/vbscript:) values on URL-sink attributes.
  strict: false
}, overrides);

/**
 * The default app's configuration object.
 *
 * It is exported (and re-exported as `Lego.config`) so that `Lego.config.x = y`
 * keeps working, and so the handful of call sites with no app in hand
 * (persistence, $mount) have somewhere to read `debug` and `onError` from.
 * Anything that can reach an app should read `app.config` instead.
 */
export const config = createConfig();

/**
 * Merge descriptors from source to target
 * @param {object} source - The source object
 * @param {object} target - The target object
 */
export const mergeDescriptors = (source, target) => {
  if (!source || !target) return;
  Object.getOwnPropertyNames(source).forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    Object.defineProperty(target, key, desc);
  });
};

/**
 * Get delimiters for a config. Defaults to the default app's config so pure
 * callers and tests keep working unchanged.
 * @param {object} [cfg] - the config whose `syntax` decides the pair
 * @returns {string[]} - The delimiters
 */
export const getDelimiters = (cfg = config) => {
  return cfg.syntax === 'brackets' ? ['[[', ']]'] : ['{{', '}}'];
};

/**
 * Cache for regexes
 */
const REGEX_CACHE = new Map();

/**
 * Create a regex for matching delimiters. The cache is keyed on the delimiter
 * pair itself, so two apps with different syntaxes each get their own entry
 * and neither pays for the other.
 * @param {object} [cfg] - the config whose `syntax` decides the pair
 * @returns {RegExp} - The regex
 */
export const createRegex = (cfg = config) => {
  const [start, end] = getDelimiters(cfg);
  const key = start + end;
  if (REGEX_CACHE.has(key)) {
    const cached = REGEX_CACHE.get(key);
    cached.lastIndex = 0;
    return cached;
  }

  // Escape special regex characters
  const s = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const e = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${s}(.*?)${e}`, 'g');
  REGEX_CACHE.set(key, regex);
  return regex;
};

/**
 * Derive block name from filename by converting snake_case to kebab-case
 * and PascalCase/camelCase to kebab-case
 * @param {string} filename - The filename of the .lego file
 * @returns {string} - The derived block name
 */
export const deriveBlockName = (filename) => {
  const basename = filename.split('/').pop().replace(/\.lego$/, '');
  const name = basename
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  if (!name.includes('-')) {
    throw new Error(`[Lego] Invalid block definition: "${filename}". Block names must contain a hyphen (e.g. user-card.lego or UserCard.lego).`);
  }
  return name;
};

/**
 * `user-name` -> `userName`. Attribute names are case insensitive in HTML, so
 * a prop written `:user-name` on a tag has to be translated before it can be
 * matched against the camelCase key the block declared.
 * @param {string} name
 * @returns {string}
 */
export const camelCase = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * `userName` -> `user-name`, the inverse used to derive the attribute name a
 * declared prop answers to.
 * @param {string} name
 * @returns {string}
 */
export const kebabCase = (name) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/**
 * `:name="expr"` on an element. On a block, or any tag with a hyphen (a block
 * that may not be registered yet), it is a prop. On a built-in element it
 * binds the attribute, which is the only way to toggle `disabled`, `hidden`
 * and the rest: an interpolated `disabled="[[ busy ]]"` is always present.
 * @param {string} tagName - lowercase tag name
 * @returns {boolean} whether `:name` on this tag is a prop
 */
export const bindsAsProp = (tagName) => tagName.includes('-');

/** HTML boolean attributes: present means true, whatever the value says. */
export const BOOLEAN_ATTRS = new Set((
  'allowfullscreen async autofocus autoplay checked controls default defer disabled ' +
  'formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate ' +
  'open playsinline readonly required reversed selected'
).split(' '));

/**
 * The attribute text a `:name` binding writes on a built-in element, or null
 * to remove the attribute. A boolean attribute is present when the value is
 * truthy (or `''`) and absent otherwise. Any other attribute is absent only
 * for `null` and `undefined`, so `:aria-expanded="open"` writes `"false"`,
 * which is what assistive technology needs, rather than dropping it.
 * Shared by the client renderer and the server so both write the same thing.
 * @param {string} name - attribute name
 * @param {*} value - the expression's value
 * @returns {?string}
 */
export const boundAttrText = (name, value) => {
  if (BOOLEAN_ATTRS.has(name)) return value || value === '' ? '' : null;
  if (value === null || value === undefined) return null;
  return String(value);
};

/**
 * Resolve a path in an object
 * @param {string} path - The path to resolve
 * @param {object} obj - The object to resolve the path in
 * @returns {any} - The resolved value
 */
export const resolve = (path, obj) => {
  if (!path) return '';
  const parts = path.trim().split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return '';
    current = current[part];
  }
  return current ?? '';
};

export const isNode = (val) => typeof Node !== 'undefined' && val instanceof Node;

/**
 * Decide whether a value may be wrapped in a reactive Proxy.
 *
 * Arrays qualify, and so does anything reporting the default `[object
 * Object]` tag: plain objects, null-prototype objects, and ordinary class
 * instances (a `new Store()` held in state stays reactive).
 *
 * Everything else is handed back raw. Built-ins that carry internal slots
 * announce themselves through `Symbol.toStringTag` or a spec-level branch
 * in `Object.prototype.toString` (Set, Map, WeakMap/WeakSet, Date, Promise,
 * RegExp, Error, ArrayBuffer, typed arrays, Blob, File, FormData, URL, ...).
 * Their methods read those slots off `this`, and `this` would be the Proxy,
 * so calling `tags.size` or `map.get(k)` through a wrapper throws
 * "Method ... called on incompatible receiver".
 *
 * The toString tag is also cross-realm safe, unlike comparing against this
 * realm's `Object.prototype`: block logic frequently originates in another
 * realm (a JSDOM window vs. the Node realm, an iframe, a worker).
 *
 * Note: a class using `#private` fields is still unsupported in state, for
 * the same receiver reason. That predates this predicate.
 *
 * @param {any} val - candidate value
 * @returns {boolean} true when `val` is safe to wrap
 */
export const isReactiveTarget = (val) => {
  if (val === null || typeof val !== 'object') return false;
  if (isNode(val)) return false;
  if (Array.isArray(val)) return true;
  return Object.prototype.toString.call(val) === '[object Object]';
};


export const scanForAttribute = (name, node, context) => {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const attr = [...node.attributes].find(a => a.name === name || a.name.startsWith(`${name}.`));
  if (!attr) return;
  let extras = {};
  if (context) extras = context(attr, node);
  return {
    type: name,
    node,
    expr: attr.value,
    modifiers: attr.name.split('.').slice(1),
    ...extras
  };
}
