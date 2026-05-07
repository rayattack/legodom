import { registry } from '../core/registry.js';

export const escapeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
};

export const findAncestor = (el, tagName) => {
  if (!el) return undefined;
  let parent = el.parentElement || (el.getRootNode ? el.getRootNode().host : null);
  while (parent) {
    const pName = parent.tagName ? parent.tagName.toLowerCase() : '';
    if (pName) {
      if (tagName === '*' && registry[pName]) return parent;
      if (pName === tagName.toLowerCase()) return parent;
    }
    parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
  }
  return undefined;
};

/**
 * Enterprise Target Resolver
 * Resolves strings (#id, tag-name) or functions into DOM Elements.
 */
export const resolveTargets = (query, contextEl) => {
  if (typeof query === 'function') {
    const all = Array.from(document.querySelectorAll('*')).filter(n => n.tagName.includes('-'));
    return [].concat(query(all));
  }
  if (query.startsWith('#')) {
    const el = document.getElementById(query.slice(1));
    return el ? [el] : [];
  }
  // Scoped search first (within the calling block), then global fallback
  const scoped = contextEl?.querySelectorAll(query) || [];
  return scoped.length > 0 ? [...scoped] : [...document.querySelectorAll(query)];
};
export const findSyncAttr = (node) =>
  node.attributes
    ? [...node.attributes].find(a => a.name === 'b-sync' || a.name.startsWith('b-sync.'))
    : null;

/**
 * Minimal HTML sanitizer used as a fallback when `b-html.safe` is set but
 * `config.sanitize` is not. Strips <script>/<iframe>/<object>/<embed>/<link>/<meta>
 * elements, all `on*` event-handler attributes, and `javascript:` URLs.
 *
 * Tag matching is case-insensitive: SVG and MathML elements live in foreign
 * namespaces and preserve their author-supplied case (so SVG `<script>` has
 * `tagName === 'script'`, not `'SCRIPT'`). A case-sensitive set check would
 * silently let `<svg><script>...</script></svg>` through.
 *
 * This is NOT a full sanitizer — for production, set
 * `Lego.config.sanitize = DOMPurify.sanitize` (or equivalent).
 */
const DANGEROUS_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'style']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc', 'data']);

export const defaultSanitize = (html) => {
  if (typeof html !== 'string' || html === '') return html;
  if (typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];
  let node;
  while (node = walker.nextNode()) {
    if (DANGEROUS_TAGS.has(node.tagName.toLowerCase())) {
      toRemove.push(node);
      continue;
    }
    // Strip event-handler attributes and dangerous URL schemes
    for (let i = node.attributes.length - 1; i >= 0; i--) {
      const attr = node.attributes[i];
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.has(name)) {
        const v = attr.value.trim().toLowerCase();
        if (v.startsWith('javascript:') || v.startsWith('data:text/html') || v.startsWith('vbscript:')) {
          node.removeAttribute(attr.name);
        }
      }
    }
  }
  toRemove.forEach(n => n.remove());
  return tpl.innerHTML;
};

export const syncModelValue = (el, val) => {
  if (el.type === 'checkbox') {
    if (el.checked !== !!val) el.checked = !!val;
  } else {
    const normalized = (val === undefined || val === null) ? '' : String(val);
    if (el.value !== normalized) el.value = normalized;
  }
};
