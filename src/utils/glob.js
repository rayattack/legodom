/**
 * Minimal glob matcher.
 *
 * Exists so the Vite plugin can discover `.lego` files without pulling
 * `fast-glob` (and its dependency tree) into what is advertised as a
 * zero-dependency package. It is deliberately small: the plugin's `include`
 * option only ever needs directory/extension patterns.
 *
 * Supported syntax:
 *   `**` followed by `/`  zero or more path segments
 *   `**` on its own       anything, path separators included
 *   `*`                   anything except `/`
 *   `?`                   exactly one character except `/`
 *
 * Not supported (and not needed here): brace expansion, character classes,
 * extglobs, negation.
 */

// Regex metacharacters that must survive as literals. `*` and `?` are
// handled by the tokenizer, so they are absent from this set.
const REGEX_METACHARS = /[.+^${}()|[\]\\]/g;

const escapeLiteral = (str) => str.replace(REGEX_METACHARS, '\\$&');

/**
 * Compile a glob pattern to an anchored RegExp matching POSIX-style
 * relative paths (forward slashes).
 *
 * @param {string} pattern - glob pattern, e.g. `blocks/**\/*.lego`
 * @returns {RegExp} anchored regular expression
 */
export const globToRegExp = (pattern) => {
  const normalized = String(pattern).replace(/\\/g, '/');
  let source = '';
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];

    if (char === '*' && normalized[i + 1] === '*') {
      // `**/` spans zero or more whole segments, so `**\/*.lego` still
      // matches a file sitting directly in the search root.
      const spansSegments = normalized[i + 2] === '/';
      source += spansSegments ? '(?:[^/]*\\/)*' : '.*';
      i += spansSegments ? 3 : 2;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      i += 1;
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      i += 1;
      continue;
    }
    source += escapeLiteral(char);
    i += 1;
  }

  return new RegExp(`^${source}$`);
};

/**
 * Test one relative path against one glob pattern.
 *
 * @param {string} pattern - glob pattern
 * @param {string} relativePath - path relative to the search root
 * @returns {boolean}
 */
export const matchGlob = (pattern, relativePath) =>
  globToRegExp(pattern).test(String(relativePath).replace(/\\/g, '/'));
