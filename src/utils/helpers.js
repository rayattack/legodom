export const config = {
  onError: (err, type, el) => {
    console.error(`[Lego Error] [${type}]`, err, el);
  },
  metrics: {},   // Performance hooks
  debug: false,
  syntax: 'brackets' // 'brackets' ([[ ]]) or 'mustache' ({{ }})
};

export const mergeDescriptors = (source, target) => {
  if (!source || !target) return;
  Object.getOwnPropertyNames(source).forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    Object.defineProperty(target, key, desc);
  });
};

export const getDelimiters = () => {
  return config.syntax === 'brackets' ? ['[[', ']]'] : ['{{', '}}'];
};

export const createRegex = () => {
  const [start, end] = getDelimiters();
  // Escape special regex characters
  const s = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const e = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${s}(.*?)${e}`, 'g');
};

export const deriveBlockName = (filename) => {
  const basename = filename.split('/').pop().replace(/\.lego$/, '');
  // 1. Convert snake_case to kebab-case
  // 2. Convert PascalCase/camelCase to kebab-case
  const name = basename
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  if (!name.includes('-')) {
    throw new Error(`[Lego] Invalid block definition: "${filename}". Block names must contain a hyphen (e.g. user-card.lego or UserCard.lego).`);
  }
  return name;
};

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
