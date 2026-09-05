/**
 * The server side render walk.
 *
 * This is the same template language src/core/renderer.js and
 * src/directives/ implement against a live DOM, expressed as a pure
 * string producing tree walk. Expressions go through the very same
 * `compile()` the client uses, so identifier resolution order is identical:
 * helpers, then scope, then the named context values, then the safe global
 * allowlist.
 *
 * Nothing here mutates a parsed template. Every render builds fresh
 * attribute lists and output strings, so one parsed definition serves any
 * number of concurrent requests.
 *
 * Imports are restricted to the pure utility modules. Nothing from core/ or
 * features/, and nothing that touches `document` or `window`.
 */
import { compile } from '../utils/expression.js';
import { mergeDescriptors, resolve } from '../utils/helpers.js';
import {
  VOID_ELEMENTS,
  attrValue,
  escapeAttr,
  escapeText,
  findAttr,
  serializeAttrs
} from './html.js';

/**
 * How deep block composition may nest before the renderer stops and emits an
 * empty host. A block that renders itself, directly or through a cycle,
 * would otherwise recurse until the stack gives out. The host still carries
 * `b-hydrate`, so the client fills it in on mount.
 */
export const MAX_BLOCK_DEPTH = 32;

/** Longest expression source echoed back in an error message. */
const MAX_REPORTED_SOURCE = 80;

/** Prefix that routes a b-text / b-sync path at globals instead of state. */
const GLOBAL_PREFIX = 'global.';

/** Same shape src/directives/b-for.js accepts: `item in expression`. */
const FOR_SYNTAX = /^\s*(\w+)\s+in\s+([\s\S]+?)\s*$/;

const HIDDEN_STYLE = 'display: none';

const truncate = (raw) =>
  (raw.length > MAX_REPORTED_SOURCE ? `${raw.slice(0, MAX_REPORTED_SOURCE)}...` : raw);

const blockError = (frame, message, cause) => {
  const err = new Error(`[Lego SSR] <${frame.name}>: ${message}`);
  if (cause) err.cause = cause;
  return err;
};

/* ------------------------------------------------------------------ *
 * Expressions
 * ------------------------------------------------------------------ */

/**
 * Evaluate one template expression in `scope`.
 *
 * A ReferenceError renders as nothing, matching the client's non strict
 * default (safe-eval.js swallows them unless `config.strict`). A denied
 * property read warns and yields undefined, also matching the client.
 * Everything else is the author's bug and propagates, wearing the block name
 * and the expression.
 */
const evaluate = (frame, source, scope) => {
  const { ctx } = frame;
  try {
    return compile(source)(scope, {
      helpers: ctx.helpers,
      global: ctx.globals,
      self: null,
      // No event context, so a function valued result is never auto invoked.
      // That is exactly what the client does outside an event handler.
      event: undefined
    });
  } catch (err) {
    if (err && err.denied) {
      console.warn(`[Lego SSR] <${frame.name}>: blocked access to "${err.denied}" in "${truncate(source)}"`);
      return undefined;
    }
    if (err instanceof ReferenceError) return undefined;
    throw blockError(frame, `failed evaluating "${truncate(source)}": ${err.message}`, err);
  }
};

const truthy = (frame, source, scope) => !!evaluate(frame, source, scope);

const asText = (value) => (value === undefined || value === null ? '' : String(value));

/**
 * Replace every `[[ expr ]]` (or `{{ expr }}`) in `template`, escaping each
 * result with `escape`. Literal source between the delimiters is emitted
 * untouched: it is already valid markup written by the author.
 *
 * The renderer's delimiter RegExp is global and shared, which is safe because
 * nothing reachable from `evaluate` can call back into `interpolate`. State
 * getters and methods see no renderer API, and the directives that recurse
 * (b-for, b-mount, a nested block) all do so outside a replace callback.
 */
const interpolate = (frame, template, scope, escape) => {
  const { ctx } = frame;
  if (!template.includes(ctx.delimiterStart)) return template;
  return template.replace(ctx.delimiterRe, (_, expr) =>
    escape(asText(evaluate(frame, expr.trim(), scope))));
};

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * Build the state object one render sees: the block's logic, then the props
 * layered over it. `mergeDescriptors` copies descriptors rather than values,
 * so an author's getter stays a getter and runs on read with `this` bound to
 * this object. The client memoizes those into computeds; there is nothing to
 * invalidate in a single pass, so here they simply run.
 *
 * Lifecycle hooks (`mounted`, `updated`, `unmounted`) land on state like any
 * other key and are never called.
 *
 * The copy is shallow, exactly as it is on the client, so a nested object or
 * array in a block's logic is shared by every render of that block. Nothing
 * here writes to state, but a method an author calls from a template could.
 * Treat a definition's logic as read only, or pass mutable data in as a prop.
 */
export const buildState = (logic, props) => {
  const state = {};
  mergeDescriptors(logic, state);
  mergeDescriptors(props, state);
  return state;
};

/* ------------------------------------------------------------------ *
 * Attributes
 * ------------------------------------------------------------------ */

const setAttr = (attrs, name, value) => {
  const found = attrs.find(([attrName]) => attrName === name);
  if (found) {
    found[1] = value;
    return;
  }
  attrs.push([name, value]);
};

const setFlagAttr = (attrs, name, present) => {
  const at = attrs.findIndex(([attrName]) => attrName === name);
  if (!present) {
    if (at >= 0) attrs.splice(at, 1);
    return;
  }
  if (at < 0) attrs.push([name, null]);
};

/** Append `display: none` to the inline style, creating it when absent. */
const hide = (attrs) => {
  const found = attrs.find(([name]) => name === 'style');
  if (!found || found[1] === null || found[1].trim() === '') {
    setAttr(attrs, 'style', HIDDEN_STYLE);
    return;
  }
  const current = found[1].trim();
  found[1] = current.endsWith(';') ? `${current} ${HIDDEN_STYLE}` : `${current}; ${HIDDEN_STYLE}`;
};

/**
 * Write the state value onto a form control, by the rules `syncModelValue`
 * in src/utils/dom.js applies to a live element. A `<textarea>` carries its
 * value as text rather than an attribute, so it is handled with the
 * element's content instead.
 */
const applySync = (frame, node, attrs, sync, scope) => {
  const path = sync.value;
  const value = path.startsWith(GLOBAL_PREFIX)
    ? resolve(path.slice(GLOBAL_PREFIX.length), frame.ctx.globals)
    : resolve(path, scope);
  const type = String(attrValue(node, 'type') || '').toLowerCase();

  if (type === 'checkbox') {
    setFlagAttr(attrs, 'checked', !!value);
    return;
  }
  if (type === 'radio') {
    const own = attrValue(node, 'value');
    const selected = value !== undefined && value !== null && String(value) === (own === undefined || own === null ? '' : own);
    setFlagAttr(attrs, 'checked', selected);
    return;
  }
  if (node.tag === 'textarea') return;
  setAttr(attrs, 'value', escapeAttr(asText(value)));
};

/**
 * Every authored attribute, in source order, with interpolation applied and
 * the two directives that write attributes folded in. Nothing is stripped:
 * `b-*`, `@event` and `:prop` all survive verbatim because the client
 * re-scans them when it takes over.
 */
const renderAttributes = (frame, node, scope) => {
  const attrs = node.attrs.map(([name, value]) => [
    name,
    value === null ? null : interpolate(frame, value, scope, escapeAttr)
  ]);

  const show = findAttr(node, 'b-show');
  if (show && !truthy(frame, show.value, scope)) hide(attrs);

  const sync = findAttr(node, 'b-sync');
  if (sync) applySync(frame, node, attrs, sync, scope);

  return attrs;
};

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

const renderChildren = (frame, nodes, scope) =>
  nodes.map((node) => renderNode(frame, node, scope)).join('');

const renderText = (frame, node, scope) => {
  // Text inside <style>, <script>, <textarea> and <title> is not markup, so
  // interpolated values go in as they are. The client sets textContent there
  // and gets the same result. Note that this means an interpolation inside a
  // <script> lands in an executable context, on the server as in the browser.
  // Never interpolate untrusted data into one.
  if (node.raw) return interpolate(frame, node.value, scope, asText);
  return interpolate(frame, node.value, scope, escapeText);
};

function renderNode(frame, node, scope) {
  if (node.type === 'text') return renderText(frame, node, scope);
  if (node.type === 'comment') return `<!--${node.value}-->`;
  return renderElement(frame, node, scope);
}

/**
 * The two terminal directives run first, in the order the client's directive
 * table gives them: `b-if` decides whether the element exists at all, then
 * `b-for` decides how many of it there are.
 */
function renderElement(frame, node, scope) {
  const cond = findAttr(node, 'b-if');
  if (cond && !truthy(frame, cond.value, scope)) return `<!--b-if: ${cond.value}-->`;

  const loop = findAttr(node, 'b-for');
  const parsed = loop ? loop.value.match(FOR_SYNTAX) : null;
  if (parsed) return renderFor(frame, node, scope, parsed);

  return renderResolved(frame, node, scope);
}

/**
 * Everything after `b-if` and `b-for`: a slot to fill, a nested block to
 * render, or an ordinary element.
 */
function renderResolved(frame, node, scope) {
  if (frame.light && node.tag === 'slot') return renderSlot(frame, node, scope);
  const def = frame.ctx.definitions.get(node.tag);
  if (def) return renderNested(frame, node, scope, def);
  return renderPlain(frame, node, scope);
}

/**
 * The key the client would compute for this item, so hydration can pair a
 * server rendered row with the row the client builds.
 *
 * Order follows src/directives/b-for.js exactly, including its use of `||`
 * for the auto detected id fields: an item whose `id` is falsy falls past
 * them. The client's final fallback is a WeakMap keyed on object identity,
 * which no server can know, so keyless object rows carry their index and
 * rehydrate by position.
 */
const rowKey = (item, index, keyPath) => {
  if (keyPath) {
    const resolved = resolve(keyPath, item);
    if (resolved === null || resolved === undefined || resolved === '') return `__bfor_${index}`;
    return String(resolved);
  }
  if (item && typeof item === 'object') {
    const detected = item.id || item._id || item.uuid || item.key;
    return detected === undefined ? String(index) : String(detected);
  }
  return `${index}-${item}`;
};

/**
 * A `b-for` becomes the anchor comment the client also creates, followed by
 * one rendered clone per item. Each clone keeps `b-for` and `b-key` as
 * authored (the client re-scans them) and gains `data-b-key`.
 */
function renderFor(frame, node, scope, parsed) {
  const itemName = parsed[1];
  const listName = parsed[2].trim();
  const keyPath = attrValue(node, 'b-key') || null;
  const list = evaluate(frame, listName, scope) || [];

  if (typeof list.forEach !== 'function') {
    throw blockError(frame, `b-for list "${truncate(listName)}" is not iterable`);
  }

  const rows = [];
  list.forEach((item, index) => {
    // Object.create keeps the parent scope reachable through the prototype
    // chain, which is how the client isolates loop scopes too.
    const rowScope = Object.create(scope);
    rowScope[itemName] = item;
    rowScope.$index = index;
    const rowNode = {
      type: 'el',
      tag: node.tag,
      attrs: node.attrs.concat([['data-b-key', escapeAttr(rowKey(item, index, keyPath))]]),
      children: node.children
    };
    rows.push(renderResolved(frame, rowNode, rowScope));
  });

  return `<!--b-for: ${itemName} in ${listName}-->${rows.join('')}`;
}

/**
 * Fill a `<slot>` in a light DOM block. Content the caller supplied wins;
 * otherwise the slot's own children are the fallback. The `<slot>` wrapper
 * itself is never emitted.
 */
function renderSlot(frame, node, scope) {
  const name = attrValue(node, 'name') || '';
  const provided = name ? frame.slots.named.get(name) : frame.slots.default;
  if (provided) return provided;
  return renderChildren(frame, node.children, scope);
}

/**
 * The content of an ordinary element. Three directives replace it outright;
 * the client runs them in table order, so the last one to write wins, which
 * is `b-mount`, then `b-html`, then `b-text`.
 */
function elementContent(frame, node, scope) {
  const mount = findAttr(node, 'b-mount');
  if (mount) return renderMount(frame, mount, scope);

  const html = findAttr(node, 'b-html');
  if (html) {
    const raw = asText(evaluate(frame, html.value, scope));
    if (!html.modifiers.includes('safe')) return raw;
    return frame.ctx.sanitize(raw, frame.name);
  }

  const text = findAttr(node, 'b-text');
  if (text) {
    const path = text.value;
    const value = path.startsWith(GLOBAL_PREFIX)
      ? resolve(path.slice(GLOBAL_PREFIX.length), frame.ctx.globals)
      : resolve(path, scope);
    return escapeText(asText(value));
  }

  const sync = findAttr(node, 'b-sync');
  if (sync && node.tag === 'textarea') {
    const path = sync.value;
    const value = path.startsWith(GLOBAL_PREFIX)
      ? resolve(path.slice(GLOBAL_PREFIX.length), frame.ctx.globals)
      : resolve(path, scope);
    return escapeText(asText(value));
  }

  return renderChildren(frame, node.children, scope);
}

/** `b-mount="expr"`: render the block the expression names, if registered. */
function renderMount(frame, mount, scope) {
  const result = evaluate(frame, mount.value, scope);
  if (!result) return '';
  const tag = String(result).toLowerCase();
  const def = frame.ctx.definitions.get(tag);
  if (!def) return '';
  return renderHost(frame.ctx, tag, def, {}, emptySlots(), [], frame.depth + 1);
}

function renderPlain(frame, node, scope) {
  const attrs = renderAttributes(frame, node, scope);
  const open = `<${node.tag}${serializeAttrs(attrs)}>`;
  if (VOID_ELEMENTS.has(node.tag)) return open;
  return `${open}${elementContent(frame, node, scope)}</${node.tag}>`;
}

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

export const emptySlots = () => ({ all: '', default: '', named: new Map() });

const kebabToCamel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const camelToKebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Parse a `b-logic` attribute into a plain object, against the parent block's
 * scope. Mirrors `parseJSObject` in src/utils/safe-eval.js, minus its
 * `new Function` escape hatch: template attributes are never handed to the
 * JS engine as source on the server.
 */
const parseLogicAttr = (frame, raw, scope) => {
  const { ctx } = frame;
  if (!raw || raw.trim() === '{}') return {};

  // The body is evaluated as an expression, so an interpolated value reaching
  // it would be an injection. The client refuses the same input.
  if (raw.includes(ctx.delimiterStart) && raw.includes(ctx.delimiterEnd)) {
    console.error(
      `[Lego SSR] <${frame.name}>: refusing to parse b-logic containing template ` +
      `delimiters. Pass values through state or a :prop instead. Got: "${truncate(raw)}"`
    );
    return {};
  }

  const logicCtx = { extra: ctx.globals, global: ctx.globals };
  const trimmed = raw.trim();
  // A bare property list (`name: 'x', count: 0`) is retried wrapped in braces,
  // exactly as the client retries it.
  const sources = trimmed.startsWith('{') || !trimmed.includes(':') ? [raw] : [raw, `{${raw}}`];
  let failure = null;
  for (const source of sources) {
    try {
      return compile(source)(scope, logicCtx);
    } catch (err) {
      // Report the original failure, not the brace-wrapped retry's.
      if (failure === null) failure = err;
    }
  }
  console.error(`[Lego SSR] <${frame.name}>: error parsing b-logic "${truncate(raw)}"`, failure);
  return {};
};

/**
 * Props for a nested block, layered in the order the contract specifies:
 * the block's own logic defaults are already in place, then `b-logic`, then
 * plain attributes whose name matches a declared prop, then `:prop`
 * expressions. A bound `:prop` wins, which is what every other framework
 * does and what an author writing both would expect.
 */
const collectProps = (frame, node, scope, def) => {
  const props = {};

  const logicAttr = findAttr(node, 'b-logic') || findAttr(node, 'b-data');
  if (logicAttr) Object.assign(props, parseLogicAttr(frame, logicAttr.value, scope));

  def.propNames.forEach((propName) => {
    const raw = attrValue(node, propName) ?? attrValue(node, camelToKebab(propName));
    if (raw === undefined || raw === null) return;
    props[propName] = interpolate(frame, raw, scope, asText);
  });

  node.attrs.forEach(([name, value]) => {
    if (!name.startsWith(':') || name.length === 1) return;
    props[kebabToCamel(name.slice(1))] = evaluate(frame, value === null ? '' : value, scope);
  });

  return props;
};

/**
 * Split the children an author wrote inside a block tag into slot content.
 * They belong to the parent, so they are rendered in the parent's scope
 * before the child block ever sees them, which is what the browser does when
 * it projects light DOM into a shadow root.
 */
const collectSlots = (frame, node, scope) => {
  const rendered = node.children.map((child) => renderNode(frame, child, scope));
  const named = new Map();
  let fallback = '';

  node.children.forEach((child, index) => {
    const html = rendered[index];
    const name = child.type === 'el' ? attrValue(child, 'slot') : undefined;
    if (!name) {
      fallback += html;
      return;
    }
    named.set(name, (named.get(name) || '') + html);
  });

  return { all: rendered.join(''), default: fallback, named };
};

const hostAttributes = (attrs, tagName) => {
  const out = attrs.slice();
  if (!out.some(([name]) => name === 'b-hydrate')) out.push(['b-hydrate', null]);
  if (!out.some(([name]) => name === 'b-id')) out.push(['b-id', tagName]);
  return out;
};

function renderNested(frame, node, scope, def) {
  const attrs = renderAttributes(frame, node, scope);
  const depth = frame.depth + 1;
  if (depth > MAX_BLOCK_DEPTH) {
    return `<${node.tag}${serializeAttrs(hostAttributes(attrs, node.tag))}></${node.tag}>`;
  }
  const props = collectProps(frame, node, scope, def);
  const slots = collectSlots(frame, node, scope);
  return renderHost(frame.ctx, node.tag, def, props, slots, attrs, depth);
}

/**
 * Render one block instance, host element included.
 *
 * Shadow blocks (the default) put their template inside a declarative
 * `<template shadowrootmode="open">`, preceded by the block's `<style>`,
 * and leave the caller's content as light children after it, where the
 * browser will project it into the block's slots.
 *
 * Light DOM blocks put the rendered template straight into the host and
 * substitute `<slot>` elements themselves.
 *
 * @param {object} ctx - render context, see createContext in index.js
 * @param {string} tagName - registered block name
 * @param {object} def - the block definition record
 * @param {object} props - values layered over the block's logic defaults
 * @param {object} slots - `{ all, default, named }` slot content, pre-rendered
 * @param {Array} hostAttrs - attributes to put on the host element
 * @param {number} depth - block nesting depth, 1 for a top level render
 * @returns {string} HTML
 */
export function renderHost(ctx, tagName, def, props, slots, hostAttrs, depth) {
  const state = buildState(def.logic, props);
  const frame = {
    ctx,
    name: tagName,
    state,
    slots,
    depth,
    light: !def.shadow
  };

  const body = renderChildren(frame, def.nodes, state);
  const open = `<${tagName}${serializeAttrs(hostAttributes(hostAttrs, tagName))}>`;
  const style = def.css ? `<style${def.styleAttrs}>${def.css}</style>` : '';

  if (frame.light) return `${open}${style}${body}</${tagName}>`;
  return `${open}<template shadowrootmode="open">${style}${body}</template>${slots.all}</${tagName}>`;
}
