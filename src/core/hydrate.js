/**
 * Hydration: adopt server rendered markup instead of replacing it.
 *
 * `src/server/` renders a block to HTML and marks the host `b-hydrate`. When
 * `snap()` meets such a host it keeps the DOM the browser already painted and
 * builds the block's bindings against it, so the first render writes nothing
 * to a page that is already correct.
 *
 * The whole trick is that the live tree and the block's own `<template>` have
 * the same shape by construction: the server walked that template to produce
 * the markup. So this module walks the two in parallel, pairing nodes
 * positionally, and for every binding it takes the *value* holder from the
 * live tree and the *source* holder from the template:
 *
 *   live  <p>Hello Ada</p>          <- the binding's node
 *   tpl   <p>Hello [[ name ]]</p>   <- the binding's template string
 *
 * Where the server wrote a marker instead of an element, the marker is the
 * anchor the directive would have created:
 *
 *   <!--b-if: ready-->              b-if that rendered false
 *   <!--b-for: t in todos-->        followed by one row per item, each
 *                                   carrying data-b-key
 *
 * Anything that does not line up is a `HydrationMismatch`. `snap()` catches
 * it, warns once naming the block, and re-renders that block from its
 * template. One block falling back never disturbs the rest of the page.
 */
import { getDefinition, getPrivateData, forPools } from './registry.js';
import { directives } from '../directives/index.js';
import { getDelimiters } from '../utils/helpers.js';
import { findSyncAttr } from '../utils/dom.js';
import { bind, colonBinding } from './renderer.js';

/** Comment prefixes the server writes in place of an element. */
const IF_MARKER = 'b-if: ';
const FOR_MARKER = 'b-for: ';

/** The key the server stamps on each rendered `b-for` row. */
const KEY_ATTR = 'data-b-key';

/**
 * The index an adopted row starts life with. No real row index can equal it,
 * which is the point: see adoptRow().
 */
const NO_INDEX = -1;

/** Same shape src/directives/b-for.js accepts: `item in expression`. */
const FOR_SYNTAX = /^\s*(\w+)\s+in\s+([\s\S]+?)\s*$/;

/**
 * Directives that own their element's content outright. The server wrote
 * what they produced and the template holds what the author wrote, so the
 * two subtrees are unrelated and there is nothing to pair inside them. Each
 * one rebuilds its content on the first render.
 */
const CONTENT_DIRECTIVES = ['b-html', 'b-text', 'b-mount'];

/**
 * A structural divergence between the server's markup and the block's
 * template. Carries no more than a human readable reason: the caller decides
 * what to do about it.
 */
export class HydrationMismatch extends Error {}

const mismatch = (message) => { throw new HydrationMismatch(message); };

/** How a node reads in a mismatch message. */
const describe = (node) => {
  if (!node) return 'nothing';
  if (node.nodeType === Node.ELEMENT_NODE) return `<${node.tagName.toLowerCase()}>`;
  if (node.nodeType === Node.TEXT_NODE) return 'a text node';
  if (node.nodeType === Node.COMMENT_NODE) return 'a comment';
  return `node type ${node.nodeType}`;
};

/** `b-html`, `b-html.safe` and friends: the name, or the name plus modifiers. */
const hasDirectiveAttr = (el, name) =>
  [...el.attributes].some(a => a.name === name || a.name.startsWith(`${name}.`));

const isElement = (node) => !!node && node.nodeType === Node.ELEMENT_NODE;

const isTag = (node, tag) => isElement(node) && node.tagName === tag;

const isMarker = (node, prefix) =>
  !!node && node.nodeType === Node.COMMENT_NODE && node.textContent.startsWith(prefix);

/**
 * A declarative shadow root is markup for the element's shadow, not one of
 * its light children. Browsers that implement it remove the template while
 * parsing; `snap()` does the same for the ones that do not. Either way it
 * never pairs with anything, so it is filtered out of both child lists.
 */
const isDeclarativeShadow = (node) =>
  isTag(node, 'TEMPLATE') && node.hasAttribute('shadowrootmode');

/**
 * The child nodes that take part in pairing.
 *
 * For a light DOM block, `<slot>` is replaced by its own children: the server
 * substitutes slots itself, and a slot with nothing assigned renders exactly
 * that fallback content. Content the caller *did* assign belongs to the
 * caller and lands here instead, which is a shape the template cannot
 * describe, so those blocks mismatch and re-render. A shadow block never
 * reaches this: its slots survive into the shadow root on both sides.
 */
const pairableChildren = (parent, ctx) => {
  const out = [];
  [...parent.childNodes].forEach(node => {
    if (isDeclarativeShadow(node)) return;
    if (ctx.light && isTag(node, 'SLOT')) {
      out.push(...node.childNodes);
      return;
    }
    out.push(node);
  });
  return out;
};

/** Does this element hold anything but whitespace? */
const hasAuthoredContent = (el) => [...el.childNodes].some(node =>
  node.nodeType !== Node.TEXT_NODE || node.textContent.trim() !== '');

/* ------------------------------------------------------------------ *
 * Bindings
 * ------------------------------------------------------------------ */

/**
 * Run every directive's `scan()` against the live element, exactly as
 * `scanForBindings` does on the fresh path. Directive attributes survive the
 * server render as authored, so the live element is the right thing to read
 * them from, and the directive's own node is the live node it will act on.
 *
 * @returns {boolean} true when a directive claimed the subtree (b-for)
 */
const scanDirectives = (node, ctx) => {
  let terminal = false;
  for (const implementation of ctx.directiveList) {
    if (!implementation.scan) continue;
    const result = implementation.scan(node, {
      getPrivateData,
      pendingOperations: ctx.pendingOperations,
      current: node
    });
    if (!result) continue;
    ctx.bindings.push(result);
    if (result.terminal) terminal = true;
  }
  return terminal;
};

/**
 * Interpolated attributes and `:prop` channels. The template counterpart is
 * the only place the `[[ ]]` source still exists, so the attribute list is
 * read from it while the binding writes to the live node.
 */
const scanAttributes = (liveEl, tplEl, ctx) => {
  for (const attr of tplEl.attributes) {
    if (attr.name[0] === ':' && attr.name.length > 1) {
      ctx.bindings.push(colonBinding(liveEl, attr));
      continue;
    }
    if (attr.value.includes(ctx.delimiter)) {
      ctx.bindings.push({ type: 'attr', node: liveEl, attrName: attr.name, template: attr.value });
    }
  }
};

/**
 * The container's own attributes, matching what `scanForBindings` does for
 * the root it is handed: interpolations and `:name` bindings, no directives.
 * A b-for row is such a container.
 */
const scanContainerAttrs = (liveRoot, tplRoot, ctx) => {
  if (!isElement(tplRoot)) return;
  for (const attr of tplRoot.attributes) {
    if (attr.name[0] === ':' && attr.name.length > 1) {
      ctx.bindings.push(colonBinding(liveRoot, attr));
      continue;
    }
    if (attr.value.includes(ctx.delimiter)) {
      ctx.bindings.push({ type: 'attr', node: liveRoot, attrName: attr.name, template: attr.value });
    }
  }
};

/* ------------------------------------------------------------------ *
 * The walk
 * ------------------------------------------------------------------ */

/**
 * Should the walk descend into this pair's children?
 *
 * Two things stop it. A content directive (see CONTENT_DIRECTIVES) replaced
 * the subtree, and a nested light DOM block rendered its own template into
 * the host, so what the server put inside that tag is the child's markup and
 * not the parent's. With nothing authored inside the tag there is nothing
 * here for this block to bind and descent simply stops; with content
 * authored inside it, the server substituted that content into the child's
 * slots and positions no longer line up.
 */
const descends = (liveEl, tplEl, ctx) => {
  if (CONTENT_DIRECTIVES.some(name => hasDirectiveAttr(liveEl, name))) return false;
  const definition = getDefinition(tplEl.tagName.toLowerCase());
  if (!definition || definition.shadow) return true;
  if (!hasAuthoredContent(tplEl)) return false;
  return mismatch(
    `<${tplEl.tagName.toLowerCase()}> is a light DOM block with content written inside it, ` +
    'which the server rendered into that block\'s slots'
  );
};

const pairElement = (liveEl, tplEl, ctx) => {
  if (!isElement(liveEl)) {
    mismatch(`the template has ${describe(tplEl)} where the server rendered ${describe(liveEl)}`);
  }
  if (liveEl.tagName !== tplEl.tagName) {
    mismatch(`the template has ${describe(tplEl)} where the server rendered ${describe(liveEl)}`);
  }

  // b-show caches the author's inline `display` on its first run so it can
  // restore it later. The server appended `display: none` to the live
  // element for a false condition, which would poison that cache, so it is
  // seeded from the template's own inline style instead.
  if (hasDirectiveAttr(liveEl, 'b-show')) liveEl._bShowOriginal = tplEl.style.display;

  const terminal = scanDirectives(liveEl, ctx);
  scanAttributes(liveEl, tplEl, ctx);
  if (terminal) return;
  if (!descends(liveEl, tplEl, ctx)) return;
  walkChildren(liveEl, tplEl, ctx);
};

/**
 * Adopt a `b-if` that rendered false. The element itself is not in the page,
 * so it is cloned out of the template (which is what the fresh path holds
 * too, once the condition has flipped off) and the server's comment becomes
 * the anchor it swaps with.
 *
 * The clone is a copy of its own counterpart, so pairing it against the
 * template is trivially consistent and produces exactly the bindings a fresh
 * scan of that subtree would.
 */
const adoptIf = (comment, tplEl, ctx) => {
  const node = tplEl.cloneNode(true);
  const from = ctx.bindings.length;
  pairElement(node, tplEl, ctx);
  const binding = ctx.bindings.slice(from).find(b => b.type === 'b-if');
  if (!binding) mismatch(`<!--${comment.textContent}--> has no b-if on ${describe(tplEl)}`);
  binding.anchor = comment;
  getPrivateData(node).anchor = comment;
};

/**
 * Adopt one server rendered row into a `b-for` pool, giving it the shape a
 * freshly cloned row has.
 *
 * `_loopItem` and `_loopIndex` are deliberately left at values no real item
 * and no real index can equal, so the loop's first pass counts the row as
 * moved and runs its bindings. That pass is what mints the row's effects,
 * without which a later mutation of the item would wake nothing. The
 * compare-before-write checks in those bindings mean it still writes no DOM.
 */
const adoptRow = (row, index, binding, pool, ctx) => {
  const key = row.getAttribute(KEY_ATTR);
  row.removeAttribute(KEY_ATTR);
  row.removeAttribute('b-for');
  row.removeAttribute('b-key');
  pool.set(key, row);

  row._loopCtx = { name: binding.itemName, listName: binding.listName, index };
  bind(row, ctx.blockRoot, row._loopCtx);

  const rowTemplate = binding.template.cloneNode(true);
  rowTemplate.removeAttribute('b-for');
  rowTemplate.removeAttribute('b-key');

  const rowCtx = { ...ctx, bindings: [], pendingOperations: [] };
  scanContainerAttrs(row, rowTemplate, rowCtx);
  walkChildren(row, rowTemplate, rowCtx);
  rowCtx.pendingOperations.forEach(op => op());

  row._loopBindings = rowCtx.bindings;
  row._loopSyncInputs = [row, ...row.querySelectorAll('*')].filter(el => findSyncAttr(el));
  row._loopScope = Object.create(ctx.state);
  row._loopItem = undefined;
  row._loopIndex = NO_INDEX;
};

/**
 * Adopt a `b-for`: the server's comment is the anchor, and the sibling
 * elements after it carrying `data-b-key` are the rows.
 *
 * @returns {number} the index just past the rows in the live child list
 */
const adoptFor = (live, at, tplEl, ctx) => {
  const source = tplEl.getAttribute('b-for');
  const parsed = source.match(FOR_SYNTAX);
  if (!parsed) mismatch(`b-for="${source}" is not "item in list"`);

  const anchor = live[at];
  const binding = {
    type: 'b-for',
    anchor,
    itemName: parsed[1],
    listName: parsed[2].trim(),
    keyPath: tplEl.getAttribute('b-key') || null,
    // The row template keeps b-for and b-key, exactly as b-for's own scan
    // leaves them; each cloned row strips them.
    template: tplEl.cloneNode(true),
    terminal: true
  };
  ctx.bindings.push(binding);

  const pool = new Map();
  forPools.set(anchor, pool);

  let cursor = at + 1;
  while (isTag(live[cursor], tplEl.tagName) && live[cursor].hasAttribute(KEY_ATTR)) {
    adoptRow(live[cursor], cursor - at - 1, binding, pool, ctx);
    cursor++;
  }
  return cursor;
};

/**
 * Pair one template node against the live list, starting at `at`.
 *
 * @returns {number} the index just past whatever this template node consumed
 */
const pairNode = (live, at, tplNode, ctx) => {
  const liveNode = live[at];
  if (!liveNode) {
    mismatch(`the template has ${describe(tplNode)} where the server rendered nothing`);
  }

  if (isElement(tplNode) && tplNode.hasAttribute('b-for') && isMarker(liveNode, FOR_MARKER)) {
    return adoptFor(live, at, tplNode, ctx);
  }
  if (isElement(tplNode) && tplNode.hasAttribute('b-if') && isMarker(liveNode, IF_MARKER)) {
    adoptIf(liveNode, tplNode, ctx);
    return at + 1;
  }

  if (tplNode.nodeType === Node.TEXT_NODE) {
    if (liveNode.nodeType !== Node.TEXT_NODE) {
      mismatch(`the template has ${describe(tplNode)} where the server rendered ${describe(liveNode)}`);
    }
    if (tplNode.textContent.includes(ctx.delimiter)) {
      ctx.bindings.push({ type: 'text', node: liveNode, template: tplNode.textContent });
    }
    return at + 1;
  }
  if (tplNode.nodeType === Node.COMMENT_NODE) {
    if (liveNode.nodeType !== Node.COMMENT_NODE) {
      mismatch(`the template has ${describe(tplNode)} where the server rendered ${describe(liveNode)}`);
    }
    return at + 1;
  }

  pairElement(liveNode, tplNode, ctx);
  return at + 1;
};

function walkChildren(liveParent, tplParent, ctx) {
  const live = pairableChildren(liveParent, ctx);
  const tpl = pairableChildren(tplParent, ctx);
  let at = 0;
  for (let i = 0; i < tpl.length; i++) {
    at = pairNode(live, at, tpl[i], ctx);
  }
  if (at === live.length) return;
  mismatch(
    `the server rendered ${live.length - at} node(s) inside ${describe(liveParent)} ` +
    'that the template does not describe'
  );
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Build a block's bindings against markup that is already in the page.
 *
 * @param {Node} liveRoot - the block's render root: its shadow root, or the
 *   element itself for a light DOM block
 * @param {DocumentFragment} tplRoot - the definition template's content
 * @param {object} options
 * @param {object} options.app - the block's app, for delimiters
 * @param {HTMLElement} options.blockRoot - the host element
 * @param {object} options.state - the host's state proxy, the prototype every
 *   adopted b-for row scope is built on
 * @param {boolean} options.light - true for a `b-shadow="false"` block
 * @param {boolean} options.skipRootAttrs - true when the render root is the
 *   host itself, whose attributes belong to the parent block
 * @returns {Array} the bindings, in document order
 * @throws {HydrationMismatch} when the two trees diverge structurally
 */
export const hydrateBindings = (liveRoot, tplRoot, options) => {
  const ctx = {
    bindings: [],
    pendingOperations: [],
    delimiter: getDelimiters(options.app.config)[0],
    directiveList: Object.values(directives),
    app: options.app,
    blockRoot: options.blockRoot,
    state: options.state,
    light: !!options.light
  };

  if (!options.skipRootAttrs) scanContainerAttrs(liveRoot, tplRoot, ctx);
  walkChildren(liveRoot, tplRoot, ctx);
  ctx.pendingOperations.forEach(op => op());
  return ctx.bindings;
};
