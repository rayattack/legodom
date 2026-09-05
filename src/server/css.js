/**
 * Block style scoping.
 *
 * A shadow block's styles need only the rewrite src/core/lifecycle.js does at
 * mount: the `self` selector authors write becomes `:host`. The shadow root
 * takes care of the rest.
 *
 * A light DOM block has no such boundary, so its rules would otherwise apply
 * to the whole page. Every top level selector is prefixed with the block's
 * tag name, which is the same scoping the client side engine applies, so the
 * server and the client produce the same stylesheet.
 *
 * There is no CSS parser here and no dependency to add one. A rule splitter is
 * enough: preludes are the only thing that gets rewritten, declaration bodies
 * are copied through untouched, and anything the splitter does not recognise
 * is emitted verbatim rather than guessed at.
 */

const COMMENT_OPEN = '/*';
const COMMENT_CLOSE = '*/';
/** A backslash plus the one character it escapes. */
const ESCAPE_SEQUENCE_LENGTH = 2;

/** At-rules that wrap other rules, so scoping has to recurse into them. */
const NESTING_AT_RULES = new Set(['media', 'supports', 'container', 'layer']);

const SEGMENT_SENTINEL = '__LEGO_SEG_';
const SEGMENT_RE = /__LEGO_SEG_(\d+)__/g;
const CSS_LITERAL_RE = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
/** The bareword `self`, not part of a longer identifier. */
const SELF_SELECTOR_RE = /(?<![-\w])self(?![-\w])/g;
const SELF_SELECTOR_TEST = /(?<![-\w])self(?![-\w])/;

const LEAD_BODY_TRAIL = /^(\s*)([\s\S]*?)(\s*)$/;

/**
 * Run `transform` over `source` with strings and comments stashed behind
 * sentinels, so a `content: "self"` or a commented out selector is left
 * alone. Same trick src/core/lifecycle.js uses.
 */
const withLiteralsStashed = (source, transform) => {
  const segments = [];
  const stashed = source.replace(CSS_LITERAL_RE, (match) => {
    segments.push(match);
    return `${SEGMENT_SENTINEL}${segments.length - 1}__`;
  });
  return transform(stashed).replace(SEGMENT_RE, (_, index) => segments[Number(index)]);
};

const skipString = (css, at) => {
  const quote = css[at];
  let i = at + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += ESCAPE_SEQUENCE_LENGTH;
      continue;
    }
    if (css[i] === quote) return i + 1;
    i++;
  }
  return i;
};

const skipComment = (css, at) => {
  const end = css.indexOf(COMMENT_CLOSE, at + COMMENT_OPEN.length);
  return end < 0 ? css.length : end + COMMENT_CLOSE.length;
};

const isCommentStart = (css, at) => css[at] === '/' && css[at + 1] === '*';
const isQuote = (ch) => ch === '"' || ch === "'";

/** Index of the `}` closing the `{` at `open`, or the end of the source. */
const matchingBrace = (css, open) => {
  let depth = 0;
  let i = open;
  while (i < css.length) {
    const ch = css[i];
    if (isCommentStart(css, i)) {
      i = skipComment(css, i);
      continue;
    }
    if (isQuote(ch)) {
      i = skipString(css, i);
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return css.length;
};

/**
 * Split a CSS source into top level chunks. A chunk with a `body` is a rule
 * or a block at-rule; a chunk with `body === null` is a statement at-rule,
 * trailing whitespace, or anything else that should be copied through.
 */
const splitRules = (css) => {
  const rules = [];
  let i = 0;
  let start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (isCommentStart(css, i)) {
      i = skipComment(css, i);
      continue;
    }
    if (isQuote(ch)) {
      i = skipString(css, i);
      continue;
    }
    if (ch === ';') {
      const raw = css.slice(start, i + 1);
      rules.push({ raw, prelude: raw, body: null });
      i++;
      start = i;
      continue;
    }
    if (ch === '{') {
      const end = matchingBrace(css, i);
      rules.push({
        raw: css.slice(start, end + 1),
        prelude: css.slice(start, i),
        body: css.slice(i + 1, end)
      });
      i = end + 1;
      start = i;
      continue;
    }
    i++;
  }
  const tail = css.slice(start);
  if (tail) rules.push({ raw: tail, prelude: tail, body: null });
  return rules;
};

/** Split a selector list on its top level commas, whitespace preserved. */
const splitSelectors = (prelude) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < prelude.length) {
    const ch = prelude[i];
    if (isQuote(ch)) {
      i = skipString(prelude, i);
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(prelude.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(prelude.slice(start));
  return parts;
};

/**
 * Scope one selector to the block. A selector naming `self` already says
 * where it starts, so `self` simply becomes the tag name rather than picking
 * up a second, redundant prefix.
 */
const scopeSelector = (part, tagName) => {
  const [, lead, selector, trail] = part.match(LEAD_BODY_TRAIL);
  if (!selector) return part;
  const scoped = withLiteralsStashed(selector, (stashed) =>
    (SELF_SELECTOR_TEST.test(stashed)
      ? stashed.replace(SELF_SELECTOR_RE, tagName)
      : `${tagName} ${stashed}`));
  return `${lead}${scoped}${trail}`;
};

const atRuleName = (prelude) => {
  const match = prelude.trim().match(/^@([-\w]+)/);
  return match ? match[1].toLowerCase() : '';
};

/**
 * Prefix every top level selector in `css` with `tagName`, recursing into the
 * at-rules that wrap other rules. `@keyframes`, `@font-face` and every other
 * at-rule whose body is not a rule list are copied through untouched:
 * prefixing a keyframe selector would break the animation.
 */
function scopeRules(css, tagName) {
  return splitRules(css).map((rule) => {
    if (rule.body === null) return rule.raw;

    const name = atRuleName(rule.prelude);
    if (name && !NESTING_AT_RULES.has(name)) return rule.raw;
    if (name) return `${rule.prelude}{${scopeRules(rule.body, tagName)}}`;

    const selectors = splitSelectors(rule.prelude)
      .map((part) => scopeSelector(part, tagName))
      .join(',');
    return `${selectors}{${rule.body}}`;
  }).join('');
}

/**
 * Prepare a block's styles for the DOM it is about to land in.
 *
 * @param {string} css - the block's style source
 * @param {string} tagName - the block's tag name
 * @param {boolean} shadow - true for a shadow block, false for light DOM
 * @returns {string} the scoped CSS
 */
export const scopeStyles = (css, tagName, shadow) => {
  if (!css) return '';
  if (!shadow) return scopeRules(css, tagName);
  return withLiteralsStashed(css, (stashed) => stashed.replace(SELF_SELECTOR_RE, ':host'));
};
