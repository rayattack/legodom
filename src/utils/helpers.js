/**
 * Configuration object. It is used to configure the bheaviour of LegoDOM.
 */
export const config = {
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
  // Auto-discovery (config.loader): if set, only tag names matching this
  // pattern (or any of these patterns when given an array) will be fetched.
  // Default null = no allowlist; a console warning is emitted on first use.
  loaderAllowlist: null,
  // Opt-in stricter runtime safety: re-throws undefined-identifier
  // ReferenceErrors instead of rendering '', and drops dangerous-scheme
  // (javascript:/data:text/html/vbscript:) values on URL-sink attributes.
  strict: false
};

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
 * Get delimiters based on config
 * @returns {string[]} - The delimiters
 */
export const getDelimiters = () => {
  return config.syntax === 'brackets' ? ['[[', ']]'] : ['{{', '}}'];
};

/**
 * Cache for regexes
 */
const REGEX_CACHE = new Map();

/**
 * Create a regex for matching delimiters
 * @returns {RegExp} - The regex
 */
export const createRegex = () => {
  const [start, end] = getDelimiters();
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
