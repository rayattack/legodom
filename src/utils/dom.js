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
export const syncModelValue = (el, val) => {
  if (el.type === 'checkbox') {
    if (el.checked !== !!val) el.checked = !!val;
  } else {
    const normalized = (val === undefined || val === null) ? '' : String(val);
    if (el.value !== normalized) el.value = normalized;
  }
};
