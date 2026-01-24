/**
 * Configuration object. It is used to configure the bheaviour of LegoDOM.
 */
export const config = {
  onError: (err, type, el) => {
    console.error(`[Lego Error] [${type}]`, err, el);
  },
  metrics: {},   // Performance hooks
  debug: false,
  syntax: 'brackets' // 'brackets' ([[ ]]) or 'mustache' ({{ }})
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
  if (REGEX_CACHE.has(key)) return REGEX_CACHE.get(key);

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

export const directiveSpec = (t, n) => ({ type: t, node: n, expr: n.getAttribute(t) })
