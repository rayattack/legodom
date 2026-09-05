/**
 * Server side twin of `defaultSanitize` in src/utils/dom.js, used by
 * `b-html.safe`.
 *
 * The client version leans on the browser: it parses into a detached
 * `<template>`, walks it with a TreeWalker and serializes back. There is no
 * DOM here, so the same rules are applied over our own parse tree. The rule
 * set is copied deliberately, not imported, because src/utils/dom.js reaches
 * for `document` at module scope through its registry import.
 *
 * Keep this in step with src/utils/dom.js. This is NOT a full sanitizer.
 * For production, pass your own through `createRenderer({ sanitize })`
 * (DOMPurify or equivalent).
 */
import { parseHTML, serialize, escapeText } from './html.js';

const DANGEROUS_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'style']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc', 'data']);
const SHADOW_ATTRS = new Set(['shadowrootmode', 'shadowroot']);
const EVENT_ATTR_PREFIX = 'on';

export const isDangerousUrl = (value) => {
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v.startsWith('javascript:') || v.startsWith('data:text/html') || v.startsWith('vbscript:');
};

const keepAttr = (tag, name, value) => {
  const lower = name.toLowerCase();
  if (lower.startsWith(EVENT_ATTR_PREFIX)) return false;
  // Declarative Shadow DOM is not a supported b-html.safe input.
  if (tag === 'template' && SHADOW_ATTRS.has(lower)) return false;
  return !(URL_ATTRS.has(lower) && isDangerousUrl(value));
};

const cleanNode = (node) => {
  if (node.type !== 'el') return node;
  return {
    type: 'el',
    tag: node.tag,
    attrs: node.attrs.filter(([name, value]) => keepAttr(node.tag, name, value)),
    children: cleanNodes(node.children)
  };
};

function cleanNodes(nodes) {
  return nodes
    .filter((node) => node.type !== 'el' || !DANGEROUS_TAGS.has(node.tag))
    .map(cleanNode);
}

/**
 * Strip dangerous tags, event handler attributes and dangerous URL schemes
 * from an HTML string.
 *
 * Parsing is lenient, because this input is arbitrary third party HTML
 * rather than an author's block template. If it is broken past even that
 * (an unterminated attribute quote, say) the whole string is HTML escaped
 * instead: visible, and impossible to inject through.
 *
 * @param {string} html - raw HTML
 * @param {string} [label] - block name, for error messages
 * @returns {string} cleaned HTML
 */
export const sanitizeHTML = (html, label = 'b-html.safe') => {
  if (typeof html !== 'string' || html === '') return html;
  try {
    return serialize(cleanNodes(parseHTML(html, label, { lenient: true })));
  } catch (err) {
    return escapeText(html);
  }
};
