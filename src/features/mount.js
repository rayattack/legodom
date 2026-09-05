import { resolveTargets } from '../utils/dom.js';
import { config } from '../utils/helpers.js';

let _snap = null;
let _unsnap = null;

export const setMountHandlers = (snap, unsnap) => {
  _snap = snap;
  _unsnap = unsnap;
};

/**
 * Mount a registered component into target element(s), or create a detached element.
 *
 * @param {string|null} tagName - Component tag name (must contain hyphen), or null to clear
 * @param {string|HTMLElement|HTMLElement[]} [target] - CSS selector, DOM element, or array
 * @param {Record<string, any>} [props] - Initial state injected via $initialState
 * @returns {HTMLElement|HTMLElement[]|void}
 */
export const mount = (tagName, target, props) => {
  if (tagName != null) {
    tagName = String(tagName).toLowerCase();
    if (!tagName.includes('-')) {
      console.warn(`[Lego] $mount: "${tagName}" is not a valid custom element name (must contain a hyphen).`);
      return;
    }
  }

  // No target: create detached element for manual insertion
  if (target === undefined) {
    if (!tagName) return;
    const el = document.createElement(tagName);
    if (props) el.$initialState = props;
    return el;
  }

  // Resolve targets
  let targets;
  if (target instanceof Element) {
    targets = [target];
  } else if (Array.isArray(target)) {
    targets = target;
  } else if (typeof target === 'string') {
    targets = resolveTargets(target);
  } else {
    console.warn('[Lego] $mount: Invalid target', target);
    return;
  }

  if (targets.length === 0) {
    if (config.debug) console.log(`[Lego] $mount: No targets found for "${target}"`);
    return;
  }

  const created = [];

  targets.forEach(t => {
    if (!t) return;

    // Tear the outgoing blocks down synchronously. Setting innerHTML does
    // fire disconnectedCallback, but that teardown is deferred by a
    // microtask (see core/element.js) so the replacement's mounted() would
    // otherwise run before the old block's unmounted(). Apps that close a
    // resource in unmounted and reopen it in mounted depend on that order.
    // unsnap is idempotent, so the deferred call is a harmless no-op.
    if (_unsnap) [...t.children].forEach(child => _unsnap(child));
    t.innerHTML = '';

    if (!tagName) return; // Just clearing

    // Create element and set props BEFORE inserting into DOM,
    // because connectedCallback fires snap() on insertion.
    const el = document.createElement(tagName);
    if (props) el.$initialState = props;
    t.appendChild(el);
    if (_snap) _snap(el);

    created.push(el);
  });

  return created.length === 1 ? created[0] : created.length > 0 ? created : undefined;
};
