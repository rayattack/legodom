/**
 * Comparing the server's markup against the client's.
 *
 * LegoDOM renders a block to HTML in Node and hydrates that same markup in
 * the browser from one definition registry. That makes a question askable
 * which most frameworks cannot ask cheaply: does the server actually produce
 * what the client would have produced? Every answer here is in service of
 * making a "no" legible.
 *
 * The two strings are never byte identical for uninteresting reasons, so they
 * are normalised first. Normalisation is a liability, not a feature: each
 * thing erased here is a class of divergence this module has decided never to
 * report, so the list is short, and every entry is named below with what it
 * hides and, where the class still matters, with who catches it instead.
 *
 *   1. `b-hydrate` is dropped. It is the server's marker for "adopt me", and
 *      `snap()` removes it before the client's first render, so it can never
 *      appear on the client side. Hides: nothing, since the client cannot
 *      produce it.
 *
 *   2. Attributes are sorted by name. Attribute order is not meaningful in
 *      HTML and the two serialisers emit source order, which differs.
 *      Hides: attribute ordering, which nothing observes.
 *
 *   3. A valueless attribute (`<input disabled>`) becomes an empty valued one
 *      (`disabled=""`). The server's parser keeps the distinction, the
 *      browser's serialiser does not. Hides: nothing, the two forms are the
 *      same attribute.
 *
 *   4. `b-for`, `b-key` and `data-b-key` are dropped from every element. The
 *      server keeps the first two on each rendered row and adds the third;
 *      `src/directives/b-for.js` strips both from every clone it makes, and
 *      `adoptRow` in `src/core/hydrate.js` strips all three off the server's
 *      rows as it adopts them. So the client provably never emits any of the
 *      three, and a diff reporting them would be reporting a difference that
 *      resolves itself the moment hydration runs, three phantom rows per list
 *      row, on exactly the content people most need to check.
 *      Hides: a server that emitted a duplicate or a missing `data-b-key`.
 *      That class is not lost, it belongs to the other tool: `lego-studio
 *      hydrate` checks key presence and uniqueness structurally, which a line
 *      diff could not do anyway. Do not add these back here.
 *
 *   5. Character references in attribute values are decoded, and the value is
 *      re-quoted afterwards. `src/server/html.js` guarantees authored source
 *      round trips verbatim, so the server writes `b-if="a < b && c"` exactly
 *      as authored, which is valid: the HTML grammar only requires escaping
 *      the delimiting quote and an `&` that would start a reference. The
 *      browser has already decoded whatever it was given, so no serialiser on
 *      the client side can be byte symmetric with the server. The parsed
 *      value is the only thing with meaning.
 *      Hides: which spelling reached the wire, `&amp;` or `&`. No behaviour
 *      depends on that. Text nodes are deliberately NOT decoded: both sides
 *      escape computed text through the same rules already, and decoding
 *      there would hide a server that failed to escape a value.
 *
 *   6. Text nodes holding only whitespace are dropped, and the text of a node
 *      that does carry content is compared trimmed. That whitespace is the
 *      template author's indentation. Hides: a genuine leading or trailing
 *      space difference inside a text node, which can matter for inline
 *      layout. Nothing else about a text node is touched.
 *
 *   7. A light DOM block's `<style data-lego-style="tag">` is lifted out of
 *      the tree on both sides and compared as a set instead of in place. The
 *      framework relocates that element on purpose: the server emits it
 *      inside the host, the client's `adoptLightStyle` removes it and injects
 *      a scoped copy into the containing root, and `adoptServerLightStyle`
 *      moves the server's own element to that same root when hydrating. The
 *      two shapes converge, so its position is not a divergence.
 *      Hides: where the element sits. Not hidden, and reported as a real
 *      difference: a tag whose styles are present on one side and absent on
 *      the other, and everything in note 8.
 *
 *   8. A lifted stylesheet is compared as its list of rules, each one a
 *      selector prelude plus how many declarations its body holds. The
 *      declaration text itself is not compared.
 *      A browser CSSOM is what makes this necessary. The client's copy is
 *      re-serialized through `CSSStyleRule.style.cssText`, and Chrome
 *      normalises values on the way out: an authored `#eef1f6` comes back as
 *      `rgb(238, 241, 246)`. The server never sees a CSSOM, because
 *      `src/server/css.js` is a rule splitter that rewrites preludes and
 *      copies declaration bodies through verbatim, and the client's
 *      `scopeRules` does the same. Both bodies therefore originate from one
 *      source and only their spelling can differ, while the prelude is the
 *      only thing the scoping pass can actually get wrong.
 *      Hides: the spelling of a declaration value, and any edit to a value
 *      that leaves the number of declarations in its rule unchanged. The
 *      count is what keeps this honest about the one real class dropping the
 *      bodies would otherwise hide, a whole declaration going missing, and a
 *      mismatched count is reported naming the selector.
 *
 * Everything else survives. In particular the `<!--b-if: ...-->` and
 * `<!--b-for: ...-->` anchors stay exactly as they are: they are the
 * hydration contract, and a missing one is the bug rather than the noise.
 */

import {
  parseHTML,
  serialize,
  RAW_TEXT_ELEMENTS
} from '../../../src/server/html.js';
import { formatHTML } from '../core/render.js';
import { unifiedDiff } from '../core/diff.js';

/** The server's "adopt this host" marker, consumed by snap() before render. */
const HYDRATE_MARKER = 'b-hydrate';

/**
 * The loop bookkeeping only the server writes. See note 4 in the header for
 * why these go, and for which tool catches what their absence hides.
 */
const LOOP_ATTRS = new Set(['b-for', 'b-key', 'data-b-key']);

/** What `src/core/stylesheets.js` deduplicates a light block's CSS on. */
const STYLE_MARKER = 'data-lego-style';

/** Longest value echoed into a difference row before it is cut short. */
const MAX_BRIEF = 140;

/**
 * Above this many cells the alignment table stops being worth building. Two
 * sibling lists that long and that different are better reported as one
 * wholesale replacement than as hundreds of interleaved edits.
 */
const MAX_ALIGN_CELLS = 250_000;

/**
 * How much each kind of difference matters, lowest first.
 *
 * Structure leads because everything below a structural divergence is
 * suspect: once the two trees disagree about which elements exist, the
 * attribute and text rows underneath are downstream noise. Values come next,
 * since a wrong rendered value is the bug most worth naming, and attributes
 * last because they are the most numerous and the least often the cause.
 */
const KIND_WEIGHT = {
  element: 0,
  missing: 1,
  extra: 2,
  text: 3,
  attribute: 4
};

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

const cut = (value) => {
  const text = String(value == null ? '' : value);
  return text.length > MAX_BRIEF ? `${text.slice(0, MAX_BRIEF)}...` : text;
};

/**
 * The named character references that can reach an attribute value here.
 *
 * The full HTML table is two thousand entries and a dependency; this is the
 * set a block template or a computed value actually produces, since
 * `escapeAttr` on the server emits only the first four and an author writing
 * markup by hand reaches for those plus `&nbsp;`. Anything else is left
 * exactly as written rather than guessed at, which keeps an unrecognised
 * reference a visible difference instead of a silently mangled one.
 */
const NAMED_REFERENCES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0'
};

const REFERENCE_RE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

/**
 * Decode the character references in one attribute value.
 *
 * See note 5 in the header: the server round trips authored source verbatim
 * and the browser hands back what it parsed, so the decoded value is the only
 * form the two sides can agree on.
 */
const decodeReferences = (value) => {
  if (!value.includes('&')) return value;
  return value.replace(REFERENCE_RE, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch (err) {
        return match;
      }
    }
    const named = NAMED_REFERENCES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
};

/**
 * One element's attributes: the markers dropped, valueless attributes given
 * an empty value, references decoded, and the whole list ordered by name.
 *
 * A decoded value can hold a bare `"`, which the serializer emits inside
 * double quotes, so the quote goes straight back in escaped. Both a literal
 * `"` and an authored `&quot;` therefore land on the same spelling.
 *
 * The sort is by name only. Two attributes cannot share a name in parsed
 * HTML, so there is nothing for a tiebreak to decide.
 */
const normaliseAttrs = (attrs) => attrs
  .filter(([name]) => name !== HYDRATE_MARKER && !LOOP_ATTRS.has(name))
  .map(([name, value]) => [
    name,
    value === null ? '' : decodeReferences(value).replace(/"/g, '&quot;')
  ])
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/* ------------------------------------------------------------------ *
 * Stylesheets
 * ------------------------------------------------------------------ */

/**
 * A stylesheet reduced to what can honestly be compared: an ordered list of
 * `{ prelude, decls }`, one per rule. See note 8 in the header for why the
 * declaration text is counted rather than read.
 *
 * There is no CSS parser here and no dependency to add one, which is the same
 * position `src/server/css.js` takes. A scanner that knows about strings,
 * comments and nesting is enough, because the only questions asked of the
 * result are how the rule is selected and how many things it sets.
 */

/** Index just past a `/* ... *\/` starting at `at`, or `at` when there is none. */
const skipComment = (css, at) => {
  if (css[at] !== '/' || css[at + 1] !== '*') return at;
  const end = css.indexOf('*/', at + 2);
  return end === -1 ? css.length : end + 2;
};

/** Index just past the string literal starting at `at`. */
const skipString = (css, at) => {
  const quote = css[at];
  let i = at + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += 2;
      continue;
    }
    if (css[i] === quote) return i + 1;
    i++;
  }
  return i;
};

/** Index of the `}` matching the `{` at `at`, or the end of the source. */
const matchBrace = (css, at) => {
  let depth = 0;
  let i = at;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      i = skipComment(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return css.length;
};

/** Does this body hold rules rather than declarations? */
const holdsRules = (body) => {
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '/' && body[i + 1] === '*') {
      i = skipComment(body, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(body, i);
      continue;
    }
    if (ch === '{') return true;
    i++;
  }
  return false;
};

/**
 * How many declarations a rule body sets.
 *
 * Semicolons inside a string or inside parentheses are not separators, which
 * is what keeps a `url(data:image/png;base64,...)` from counting as two. A
 * segment counts only when it names a property, so a trailing semicolon and
 * an empty run add nothing.
 */
const countDeclarations = (body) => {
  let count = 0;
  let depth = 0;
  let start = 0;
  let i = 0;

  const take = (end) => {
    const segment = body.slice(start, end);
    if (segment.includes(':') && segment.trim() !== '') count++;
  };

  while (i < body.length) {
    const ch = body[i];
    if (ch === '/' && body[i + 1] === '*') {
      i = skipComment(body, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(body, i);
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      take(i);
      start = i + 1;
    }
    i++;
  }
  take(body.length);
  return count;
};

const BRACKETED_RE = /\[[^\]]*\]|\([^)]*\)/g;
const COMBINATOR_RE = /\s*([>+~,])\s*/g;
const SEGMENT_SENTINEL = '\u0001';

/**
 * A selector prelude in a form both engines can produce.
 *
 * Whitespace runs collapse, and the space around a combinator or a comma goes
 * entirely, because the CSSOM puts its own there: Chrome hands back
 * `selectorText` as `a > b, c` whatever the author wrote. Descendant spacing
 * survives, since it is the one piece of whitespace that means something.
 * Attribute selectors and functional notation are stashed first, so a `~=` or
 * an `nth-child(2n+1)` is left exactly as it is.
 */
const normalisePrelude = (prelude) => {
  const stashed = [];
  const masked = prelude
    .replace(/\s+/g, ' ')
    .trim()
    .replace(BRACKETED_RE, (match) => {
      stashed.push(match);
      return `${SEGMENT_SENTINEL}${stashed.length - 1}${SEGMENT_SENTINEL}`;
    });
  return masked
    .replace(COMBINATOR_RE, '$1')
    .replace(new RegExp(`${SEGMENT_SENTINEL}(\\d+)${SEGMENT_SENTINEL}`, 'g'), (_, at) => stashed[Number(at)]);
};

/**
 * Split a stylesheet into its rules. A group rule (`@media`, `@supports`,
 * `@keyframes`) recurses with its own prelude carried onto each inner rule,
 * so the condition a rule sits under is part of what gets compared.
 */
const cssRules = (css, prefix = '', out = []) => {
  const source = String(css || '');
  let i = 0;
  let start = 0;

  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '*') {
      i = skipComment(source, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(source, i);
      continue;
    }
    if (ch === '{') {
      const prelude = normalisePrelude(source.slice(start, i));
      const end = matchBrace(source, i);
      const body = source.slice(i + 1, end);
      const full = prefix ? `${prefix} > ${prelude}` : prelude;
      if (holdsRules(body)) cssRules(body, full, out);
      else out.push({ prelude: full, decls: countDeclarations(body) });
      i = end + 1;
      start = i;
      continue;
    }
    if (ch === ';') {
      // A statement at-rule with no block, `@import "x";` and friends.
      const text = normalisePrelude(source.slice(start, i));
      if (text) out.push({ prelude: prefix ? `${prefix} > ${text}` : text, decls: 0 });
      i++;
      start = i;
      continue;
    }
    if (ch === '}') {
      // A stray close. Recover rather than refuse to read the rest.
      i++;
      start = i;
      continue;
    }
    i++;
  }
  return out;
};

/** One rule, as it reads in a difference row and in the normalised markup. */
const ruleText = (rule) => `${rule.prelude} { ${rule.decls} }`;

/** The whole stylesheet in that form, one rule per line. */
const rulesText = (rules) => rules.map(ruleText).join('\n');

/**
 * A light DOM block's stylesheet, rebuilt in the form that is compared.
 *
 * The declaration counts stand in for bodies no two engines spell alike. What
 * is shown is exactly what is checked, so the Server and Client tabs can never
 * disagree with the difference list beside them.
 */
const styleNode = (tag, rules) => ({
  type: 'el',
  tag: 'style',
  attrs: [[STYLE_MARKER, tag]],
  children: rules.length ? [{ type: 'text', value: `\n${rulesText(rules)}\n`, raw: true }] : []
});

const rawTextOf = (node) => node.children
  .map((child) => (child.type === 'text' ? child.value : ''))
  .join('');

/** Is this the `<style>` a light DOM block ships with itself? */
const isLightStyle = (node) => node.type === 'el'
  && node.tag === 'style'
  && node.attrs.some(([name]) => name === STYLE_MARKER);

/**
 * Normalise one node, or return null when it carries nothing to compare.
 *
 * A light DOM block's stylesheet is lifted into `styles` and removed from the
 * tree; see note 7 in the header. Raw text elements otherwise keep their
 * children verbatim, because their content is CSS, JavaScript or literal
 * text, where whitespace is the author's and a collapse would change what the
 * element means.
 */
const normaliseNode = (node, styles) => {
  if (node.type === 'text') {
    if (node.raw) return node;
    return node.value.trim() === '' ? null : node;
  }
  if (node.type === 'comment') return node;
  if (isLightStyle(node)) {
    const tag = node.attrs.find(([name]) => name === STYLE_MARKER)[1] || '';
    styles.push({ tag: String(tag), rules: cssRules(rawTextOf(node)) });
    return null;
  }
  return {
    type: 'el',
    tag: node.tag,
    attrs: normaliseAttrs(node.attrs),
    children: RAW_TEXT_ELEMENTS.has(node.tag)
      ? node.children
      : normaliseChildren(node.children, styles)
  };
};

const normaliseChildren = (nodes, styles) => {
  const out = [];
  for (const node of nodes) {
    const next = normaliseNode(node, styles);
    if (next) out.push(next);
  }
  return out;
};

/**
 * Lifted stylesheets in a canonical order, deduplicated.
 *
 * Deduplicated by content rather than counted, because the counts legitimately
 * differ: the server emits a light block's stylesheet inside every instance of
 * that block, while `adoptLightStyle` injects one copy per root however many
 * instances there are. Two identical entries are one fact stated twice, so the
 * set is what gets compared. `key` is the comparable form of the whole sheet,
 * used both to deduplicate here and to match the two sides against each other
 * in `compareStyles`.
 */
const orderStyles = (styles) => {
  const seen = new Map();
  for (const entry of styles) {
    const key = rulesText(entry.rules);
    seen.set(`${entry.tag}\u0000${key}`, { ...entry, key });
  }
  return [...seen.values()].sort((a, b) =>
    (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
};

/**
 * Parse leniently. Neither side of this comparison is authored source: the
 * server produced one and a browser serialiser produced the other, so a
 * parse failure is a reason to keep going with what could be read rather
 * than to refuse to compare at all.
 */
const parse = (html) => {
  const source = String(html == null ? '' : html);
  if (!source.trim()) return [];
  try {
    return parseHTML(source, 'compare', { lenient: true });
  } catch (err) {
    return [];
  }
};

/**
 * Normalise one side into the two things that get compared: the tree with
 * the light DOM stylesheets lifted out of it, and those stylesheets as a set.
 */
const treeOf = (html) => {
  const styles = [];
  const nodes = normaliseChildren(parse(html), styles);
  return { nodes, styles: orderStyles(styles) };
};

/**
 * The canonical string for one side: the tree, then its lifted stylesheets in
 * a fixed order at the end. Putting them somewhere both sides agree on is
 * what keeps their relocation out of the line diff while leaving them on
 * screen for anyone reading the Server or Client tab.
 */
const textOf = ({ nodes, styles }) =>
  formatHTML(serialize(nodes.concat(styles.map((entry) => styleNode(entry.tag, entry.rules)))));

/**
 * Canonical, diff friendly HTML: the normalisations above, then the same
 * pretty printer every snapshot goes through, so the formatting is part of
 * what both sides share and never the reason they disagree.
 *
 * @param {string} html
 * @returns {string}
 */
export function normaliseHTML(html) {
  return textOf(treeOf(html));
}

/* ------------------------------------------------------------------ *
 * Describing a node
 * ------------------------------------------------------------------ */

/** How a node reads in a difference row. */
const brief = (node) => {
  if (!node) return null;
  if (node.type === 'text') return cut(node.value.trim());
  if (node.type === 'comment') return cut(`<!--${node.value}-->`);
  const attrs = node.attrs.map(([name, value]) => ` ${name}="${value}"`).join('');
  return cut(`<${node.tag}${attrs}>`);
};

/**
 * The path segment a node contributes.
 *
 * Siblings of the same kind are numbered, so two text nodes under one parent
 * do not both report as `#text` and leave a reader guessing which one the
 * row is about.
 */
const segment = (node, siblings, index) => {
  const base = node.type === 'el' ? node.tag : node.type === 'text' ? '#text' : '#comment';
  let nth = 0;
  for (let i = 0; i < index; i++) {
    const other = siblings[i];
    if (!other || other.type !== node.type) continue;
    if (node.type !== 'el' || other.tag === node.tag) nth++;
  }
  return nth === 0 ? base : `${base}[${nth}]`;
};

const join = (parent, part) => (parent ? `${parent} > ${part}` : part);

/* ------------------------------------------------------------------ *
 * Aligning two sibling lists
 * ------------------------------------------------------------------ */

/**
 * What a node is matched on: everything about it.
 *
 * A coarser signature, matching on the tag alone, looks tempting and is
 * wrong. Give it three `<li>` elements against four and it pairs them by
 * position, so one inserted row reports as three changed rows plus an extra
 * one. Matching on the whole subtree finds the true alignment instead, and
 * anything that did not match is handed to the second pass in `align` below,
 * which is where changed nodes get paired back up.
 */
const signature = (node) => {
  if (node.type === 'text') return `#text:${node.value.trim()}`;
  return serialize([node]);
};

/**
 * What a node is when its contents are set aside: the kind, and for an
 * element the tag. This is what the second pass matches on, so a row whose
 * text changed still lines up with the row it used to be.
 */
const shape = (node) => {
  if (node.type === 'text') return '#text';
  if (node.type === 'comment') return '#comment';
  return `<${node.tag}`;
};

/**
 * Longest common subsequence over two signature lists, emitted as pairs.
 * Either side of a pair may be null, which is what "the other side has a
 * node here and this one does not" looks like.
 */
const lcsPairs = (a, b, key) => {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((node) => ({ server: null, client: node }));
  if (m === 0) return a.map((node) => ({ server: node, client: null }));
  if (n * m > MAX_ALIGN_CELLS) {
    return a.map((node) => ({ server: node, client: null }))
      .concat(b.map((node) => ({ server: null, client: node })));
  }

  const sa = a.map(key);
  const sb = b.map(key);
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = sa[i] === sb[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sa[i] === sb[j]) {
      pairs.push({ server: a[i++], client: b[j++] });
      continue;
    }
    if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      pairs.push({ server: a[i++], client: null });
      continue;
    }
    pairs.push({ server: null, client: b[j++] });
  }
  while (i < n) pairs.push({ server: a[i++], client: null });
  while (j < m) pairs.push({ server: null, client: b[j++] });
  return pairs;
};

/**
 * A last resort for the nodes two passes could not match: one leftover
 * removal immediately followed by one leftover addition is one node that
 * changed into another, and saying so is more use than reporting a `<p>` gone
 * and a `<span>` arrived in the same breath.
 */
const collapse = (pairs) => {
  const out = [];
  for (let i = 0; i < pairs.length; i++) {
    const here = pairs[i];
    const next = pairs[i + 1];
    if (here.client === null && next && next.server === null) {
      out.push({ server: here.server, client: next.client });
      i++;
      continue;
    }
    out.push(here);
  }
  return out;
};

/**
 * Align two sibling lists, in two passes.
 *
 * The first pass matches whole subtrees, which is what finds the true
 * alignment: an inserted row stays one insertion instead of shunting every
 * row after it along by one. Nothing that changed can match that way, though,
 * so each run of unmatched nodes gets a second pass on `shape` alone, where a
 * row whose text changed lines back up with the row it used to be and the
 * walk can go on to say what inside it differs.
 *
 * The two passes matter to each other. A light DOM block's `<style>`, which
 * the server ships inside the host and the client hoists into the document
 * head, is a lone removal sitting next to a `<span>` whose text also changed.
 * One pass pairs the style with the span and reports nonsense; two passes
 * match span to span and leave the style reported as the one thing missing.
 */
const align = (a, b) => {
  const exact = lcsPairs(a, b, signature);
  const out = [];
  let i = 0;
  while (i < exact.length) {
    // A matched pair, or an addition with no removal before it, stands alone.
    if (exact[i].client !== null) {
      out.push(exact[i]);
      i++;
      continue;
    }
    let removedTo = i;
    while (removedTo < exact.length && exact[removedTo].client === null) removedTo++;
    let addedTo = removedTo;
    while (addedTo < exact.length && exact[addedTo].server === null) addedTo++;

    const removed = exact.slice(i, removedTo).map((pair) => pair.server);
    const added = exact.slice(removedTo, addedTo).map((pair) => pair.client);
    out.push(...collapse(lcsPairs(removed, added, shape)));
    i = addedTo;
  }
  return out;
};

/* ------------------------------------------------------------------ *
 * The walk
 * ------------------------------------------------------------------ */

const record = (out, kind, path, server, client) => {
  out.push({ kind, path, server, client });
};

const compareAttributes = (a, b, path, out) => {
  const server = new Map(a.attrs);
  const client = new Map(b.attrs);
  const names = [...new Set([...server.keys(), ...client.keys()])].sort();
  for (const name of names) {
    const left = server.has(name) ? server.get(name) : null;
    const right = client.has(name) ? client.get(name) : null;
    if (left === right) continue;
    // null and '' are different answers here: one side not writing the
    // attribute at all is not the same as writing it empty.
    record(out, 'attribute', join(path, `@${name}`), left === null ? null : cut(left), right === null ? null : cut(right));
  }
};

const compareNode = (a, b, path, out) => {
  if (a.type !== b.type) {
    record(out, 'element', path, brief(a), brief(b));
    return;
  }
  if (a.type === 'text') {
    if (a.value.trim() !== b.value.trim()) record(out, 'text', path, brief(a), brief(b));
    return;
  }
  if (a.type === 'comment') {
    // A comment is either an ordinary authored one or a directive anchor,
    // and in both cases the only thing to compare is what it says.
    if (a.value !== b.value) record(out, 'text', path, brief(a), brief(b));
    return;
  }
  if (a.tag !== b.tag) {
    record(out, 'element', path, brief(a), brief(b));
    return;
  }
  compareAttributes(a, b, path, out);
  // A raw text element's content is one text node either way, so it is
  // compared as text rather than walked as a tree.
  if (RAW_TEXT_ELEMENTS.has(a.tag)) {
    const left = serialize(a.children);
    const right = serialize(b.children);
    if (left !== right) record(out, 'text', join(path, '#text'), cut(left), cut(right));
    return;
  }
  compareChildren(a.children, b.children, path, out);
};

function compareChildren(a, b, path, out) {
  const pairs = align(a, b);
  let serverAt = 0;
  let clientAt = 0;
  for (const pair of pairs) {
    if (pair.server && pair.client) {
      const here = join(path, segment(pair.server, a, serverAt));
      compareNode(pair.server, pair.client, here, out);
      serverAt++;
      clientAt++;
      continue;
    }
    if (pair.server) {
      record(out, 'missing', join(path, segment(pair.server, a, serverAt)), brief(pair.server), null);
      serverAt++;
      continue;
    }
    record(out, 'extra', join(path, segment(pair.client, b, clientAt)), null, brief(pair.client));
    clientAt++;
  }
}

/**
 * Compare the lifted light DOM stylesheets as sets, keyed by block tag.
 *
 * A tag present on one side only is the bug worth shouting about, since it
 * means a light DOM block rendered without its CSS, so it is reported as a
 * structural difference. A tag on both sides whose text disagrees is a
 * scoping difference between `src/server/css.js` and the client's
 * `scopeRules`, which is a value question and reads as one.
 */
const byTag = (styles) => {
  const out = new Map();
  for (const entry of styles) {
    if (!out.has(entry.tag)) out.set(entry.tag, []);
    out.get(entry.tag).push(entry);
  }
  return out;
};

/**
 * Two stylesheets for one tag, rule by rule.
 *
 * The two lists come from one authored source and are walked in order, so a
 * positional comparison is the right one and a length difference is a rule
 * that exists on one side only.
 */
const compareSheets = (a, b, path, out) => {
  const span = Math.max(a.rules.length, b.rules.length);
  for (let at = 0; at < span; at++) {
    const left = a.rules[at];
    const right = b.rules[at];
    if (!left || !right) {
      record(out, 'element', path, left ? cut(ruleText(left)) : null, right ? cut(ruleText(right)) : null);
      continue;
    }
    if (left.prelude !== right.prelude) {
      record(out, 'text', path, cut(ruleText(left)), cut(ruleText(right)));
      continue;
    }
    if (left.decls === right.decls) continue;
    // Same selector, different number of things set under it. The values are
    // not compared (note 8), so this count is the whole of what stands
    // between a dropped declaration and nobody noticing.
    record(
      out,
      'text',
      `${path} ${left.prelude}`,
      `${left.decls} declaration(s)`,
      `${right.decls} declaration(s)`
    );
  }
};

const compareStyles = (a, b, out) => {
  const server = byTag(a);
  const client = byTag(b);

  const tags = [...new Set([...server.keys(), ...client.keys()])].sort();
  for (const tag of tags) {
    const path = `style[${STYLE_MARKER}="${tag}"]`;
    // A list rather than one value per tag, and compared as a multiset. One
    // block shipping two different stylesheets under the same marker is
    // exactly the duplication that marker exists to prevent, and keeping only
    // the last one seen would be this module hiding it.
    const left = [...(server.get(tag) || [])];
    const right = [...(client.get(tag) || [])];
    for (let i = left.length - 1; i >= 0; i--) {
      const at = right.findIndex((entry) => entry.key === left[i].key);
      if (at === -1) continue;
      right.splice(at, 1);
      left.splice(i, 1);
    }
    if (left.length === 0 && right.length === 0) continue;

    // One left over on each side is one stylesheet the two engines produced
    // differently, and the rules inside it say how. Anything else is a
    // stylesheet that exists on one side and not the other.
    if (left.length === 1 && right.length === 1) {
      compareSheets(left[0], right[0], path, out);
      continue;
    }
    left.forEach((entry) => record(out, 'element', path, cut(entry.key), null));
    right.forEach((entry) => record(out, 'element', path, null, cut(entry.key)));
  }
};

/**
 * Most significant first, keeping document order inside each kind. Array
 * sort is stable, so the second half of that comes for free.
 */
const rank = (differences) => differences
  .slice()
  .sort((x, y) => (KIND_WEIGHT[x.kind] ?? 9) - (KIND_WEIGHT[y.kind] ?? 9));

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Compare a server render against a client render of the same story.
 *
 * @param {string} serverHTML - what renderToString produced
 * @param {string} clientHTML - what the preview serialised out of the DOM
 * @returns {{equal: boolean, diff: string, differences: Array<{kind: string, path: string, server: ?string, client: ?string}>}}
 *   `kind` is one of 'text', 'attribute', 'element', 'missing' (the server
 *   rendered a node the client does not have) or 'extra' (the reverse).
 */
export function compareRenders(serverHTML, clientHTML) {
  const server = treeOf(serverHTML);
  const client = treeOf(clientHTML);

  const differences = [];
  compareChildren(server.nodes, client.nodes, '', differences);
  compareStyles(server.styles, client.styles, differences);

  const diff = unifiedDiff(textOf(server), textOf(client));

  return {
    // Both signals have to agree before this claims a match. The structured
    // walk is the more useful of the two and the text diff is the more
    // literal, so anything either one notices counts as a divergence.
    equal: differences.length === 0 && diff === '',
    diff,
    differences: rank(differences)
  };
}

export default compareRenders;
