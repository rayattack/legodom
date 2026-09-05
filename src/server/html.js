/**
 * A small hand written HTML parser and serializer for the LegoDOM template
 * subset. The server renderer needs a tree it can walk and splice values
 * into, and the package ships zero dependencies, so there is no parse5 or
 * linkedom here.
 *
 * Node shapes, deliberately tiny:
 *   { type: 'el',      tag, attrs: [[name, value]], children }
 *   { type: 'text',    value, raw }
 *   { type: 'comment', value }
 *
 * An attribute value of `null` means the attribute was written without one
 * (`<input disabled>`), and it serializes back that way.
 *
 * Entities are NOT decoded. Authored source is carried through verbatim and
 * re-emitted byte for byte, which makes parse then serialize an identity for
 * markup already in canonical form, and removes any chance of double
 * escaping an authored `&amp;`. Escaping is applied where it actually
 * matters instead: every value the renderer computes goes through
 * `escapeText` or `escapeAttr` before it is spliced in.
 *
 * Two normalizations are applied on the way in, both so the serializer can
 * always emit double quoted attribute values:
 *   1. a `"` inside a single quoted attribute value becomes `&quot;`
 *   2. self closing syntax on a non void element (`<div />`) becomes an
 *      ordinary open plus close pair, which is what a browser does with it
 *
 * This module is pure: no DOM, no imports from core/ or features/.
 */

const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const SELF_CLOSE = '/>';
const CLOSE_TAG_OPEN = '</';

/** Elements that never have children or a closing tag. */
export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr'
]);

/** Elements whose content is text, never markup. */
export const RAW_TEXT_ELEMENTS = new Set(['style', 'script', 'textarea', 'title']);

const TAG_NAME_START = /[a-zA-Z]/;
const TAG_NAME_CHAR = /[a-zA-Z0-9-]/;
const AFTER_TAG_NAME = /[\s/>]/;
const SPACE = /\s/;
const ATTR_NAME_END = /[\s/>=]/;

const TEXT_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const ATTR_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escape a computed value for a text position. */
export const escapeText = (value) =>
  String(value).replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);

/** Escape a computed value for a double quoted attribute position. */
export const escapeAttr = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ATTR_ESCAPES[c]);

const skipSpace = (source, from) => {
  let i = from;
  while (i < source.length && SPACE.test(source[i])) i++;
  return i;
};

/**
 * Index just past a tag name starting at `from`, or -1 when this is not a
 * tag at all. A `<` that fails this check is ordinary text, which is how
 * `[[ a < b ]]` survives the tokenizer.
 */
const tagNameEnd = (source, from) => {
  if (!TAG_NAME_START.test(source[from] || '')) return -1;
  let i = from + 1;
  while (i < source.length && TAG_NAME_CHAR.test(source[i])) i++;
  if (i < source.length && !AFTER_TAG_NAME.test(source[i])) return -1;
  return i;
};

/** Index of the `<` that closes a raw text element, or -1. */
const rawTextClose = (source, from, tag) => {
  const needle = `${CLOSE_TAG_OPEN}${tag}`;
  const lower = source.toLowerCase();
  let at = lower.indexOf(needle, from);
  while (at >= 0) {
    const after = source[at + needle.length];
    if (after === undefined || AFTER_TAG_NAME.test(after)) return at;
    at = lower.indexOf(needle, at + needle.length);
  }
  return -1;
};

/**
 * Read the attribute list of an open tag. Returns the attributes in source
 * order plus the index just past the closing `>` and whether the tag used
 * self closing syntax.
 */
const readAttributes = (source, from, fail) => {
  const attrs = [];
  let i = from;
  for (;;) {
    i = skipSpace(source, i);
    if (i >= source.length) return fail('unterminated tag', from);
    if (source[i] === '>') return { attrs, end: i + 1, selfClosed: false };
    if (source.startsWith(SELF_CLOSE, i)) {
      return { attrs, end: i + SELF_CLOSE.length, selfClosed: true };
    }

    const nameStart = i;
    while (i < source.length && !ATTR_NAME_END.test(source[i])) i++;
    if (i === nameStart) return fail(`unexpected character "${source[i]}" in tag`, i);
    const name = source.slice(nameStart, i);

    const afterName = skipSpace(source, i);
    if (source[afterName] !== '=') {
      attrs.push([name, null]);
      i = afterName;
      continue;
    }

    i = skipSpace(source, afterName + 1);
    const quote = source[i];
    if (quote !== '"' && quote !== "'") {
      const valueStart = i;
      while (i < source.length && !/[\s>]/.test(source[i])) i++;
      if (i === valueStart) return fail(`missing value for attribute "${name}"`, i);
      attrs.push([name, source.slice(valueStart, i)]);
      continue;
    }

    const close = source.indexOf(quote, i + 1);
    if (close < 0) return fail(`unterminated value for attribute "${name}"`, i);
    const raw = source.slice(i + 1, close);
    // Single quoted values may hold a bare `"`, which the serializer cannot
    // emit inside double quotes. Normalize once, here.
    attrs.push([name, quote === "'" ? raw.replace(/"/g, '&quot;') : raw]);
    i = close + 1;
  }
};

/**
 * Parse an HTML fragment into a node list.
 *
 * @param {string} source - markup to parse
 * @param {string} [label] - block or template name, used in error messages
 * @param {object} [options] - `lenient: true` recovers from unclosed and
 *   mismatched tags instead of throwing. Block templates are parsed
 *   strictly; only the `b-html.safe` sanitizer, which is handed arbitrary
 *   third party HTML, parses leniently.
 * @returns {Array} parsed nodes
 */
export function parseHTML(source, label = 'template', options = {}) {
  const lenient = options.lenient === true;
  const root = { type: 'el', tag: null, attrs: [], children: [] };
  const stack = [{ node: root, tag: null, start: 0 }];
  let i = 0;
  let textStart = 0;

  const fail = (message, at) => {
    throw new Error(`[Lego SSR] ${label}: ${message} at offset ${at}`);
  };
  const top = () => stack[stack.length - 1];
  const push = (node) => top().node.children.push(node);
  const flushText = (end) => {
    if (end <= textStart) return;
    push({ type: 'text', value: source.slice(textStart, end), raw: false });
  };
  /** Pop up to and including `tag`, or report that it was never open. */
  const closeTo = (tag) => {
    for (let at = stack.length - 1; at > 0; at--) {
      if (stack[at].tag !== tag) continue;
      stack.length = at;
      return true;
    }
    return false;
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) break;

    if (source.startsWith(COMMENT_OPEN, lt)) {
      const end = source.indexOf(COMMENT_CLOSE, lt + COMMENT_OPEN.length);
      if (end < 0) return fail('unterminated comment', lt);
      flushText(lt);
      push({ type: 'comment', value: source.slice(lt + COMMENT_OPEN.length, end) });
      i = end + COMMENT_CLOSE.length;
      textStart = i;
      continue;
    }

    if (source[lt + 1] === '!') {
      if (lenient) {
        i = lt + 1;
        continue;
      }
      return fail('doctypes and markup declarations are not part of a block template', lt);
    }

    if (source.startsWith(CLOSE_TAG_OPEN, lt)) {
      const nameEnd = tagNameEnd(source, lt + CLOSE_TAG_OPEN.length);
      const gt = nameEnd < 0 ? -1 : skipSpace(source, nameEnd);
      if (nameEnd < 0 || source[gt] !== '>') {
        if (lenient) {
          i = lt + 1;
          continue;
        }
        return fail('malformed closing tag', lt);
      }
      const tag = source.slice(lt + CLOSE_TAG_OPEN.length, nameEnd).toLowerCase();
      flushText(lt);
      i = gt + 1;
      textStart = i;

      const open = top();
      if (open.tag === tag) {
        stack.pop();
        continue;
      }
      // Lenient input gets the browser's recovery: close whatever this tag
      // was really closing, and drop it if it was closing nothing.
      if (lenient) {
        closeTo(tag);
        continue;
      }
      if (open.tag === null) return fail(`closing tag </${tag}> matches no open element`, lt);
      return fail(`closing tag </${tag}> does not match the open <${open.tag}> element`, lt);
    }

    const nameEnd = tagNameEnd(source, lt + 1);
    if (nameEnd < 0) {
      // Not a tag: an ordinary `<` in text, as in `[[ a < b ]]`.
      i = lt + 1;
      continue;
    }

    const tag = source.slice(lt + 1, nameEnd).toLowerCase();
    const read = readAttributes(source, nameEnd, fail);
    flushText(lt);
    const node = { type: 'el', tag, attrs: read.attrs, children: [] };
    push(node);
    i = read.end;
    textStart = i;

    if (VOID_ELEMENTS.has(tag) || read.selfClosed) continue;

    if (!RAW_TEXT_ELEMENTS.has(tag)) {
      stack.push({ node, tag, start: lt });
      continue;
    }

    const close = rawTextClose(source, i, tag);
    if (close < 0) return fail(`unterminated <${tag}> element`, lt);
    if (close > i) node.children.push({ type: 'text', value: source.slice(i, close), raw: true });
    const gt = source.indexOf('>', close);
    if (gt < 0) return fail(`unterminated closing tag for <${tag}>`, close);
    i = gt + 1;
    textStart = i;
  }

  flushText(source.length);

  if (stack.length > 1 && !lenient) {
    const open = top();
    return fail(`unclosed <${open.tag}> element`, open.start);
  }
  return root.children;
}

/** Serialize an attribute list. Valueless attributes stay valueless. */
export const serializeAttrs = (attrs) =>
  attrs.map(([name, value]) => (value === null ? ` ${name}` : ` ${name}="${value}"`)).join('');

const serializeNode = (node) => {
  if (node.type === 'text') return node.value;
  if (node.type === 'comment') return `${COMMENT_OPEN}${node.value}${COMMENT_CLOSE}`;
  const open = `<${node.tag}${serializeAttrs(node.attrs)}>`;
  if (VOID_ELEMENTS.has(node.tag)) return open;
  return `${open}${serialize(node.children)}</${node.tag}>`;
};

/** Serialize a node list back to HTML. */
export function serialize(nodes) {
  return nodes.map(serializeNode).join('');
}

/** First attribute named exactly `name`, or undefined. */
export const attrValue = (node, name) => {
  const found = node.attrs.find(([attrName]) => attrName === name);
  return found ? found[1] : undefined;
};

/**
 * Find an attribute by its base name, allowing dotted modifiers, so
 * `b-html.safe` is found by `b-html`. Mirrors `scanForAttribute` in
 * src/utils/helpers.js.
 */
export const findAttr = (node, base) => {
  const prefix = `${base}.`;
  const found = node.attrs.find(([name]) => name === base || name.startsWith(prefix));
  if (!found) return null;
  return { name: found[0], value: found[1] === null ? '' : found[1], modifiers: found[0].split('.').slice(1) };
};
