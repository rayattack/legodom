import { registry, legoFileLogic, sharedStates, activeBlocks, getPrivateData, globalSubscribers, privateData, forPools } from './registry.js';
import { globals } from './globals.js';
import { directives } from '../directives/index.js';
import { config, mergeDescriptors, resolve, isNode } from '../utils/helpers.js';
import { findAncestor } from '../utils/dom.js';
import { parseJSObject } from '../utils/safe-eval.js';
import { reactive } from './reactive.js';
import { bind, render } from './renderer.js';
import { applyStyles } from './stylesheets.js';
import { findErrorBoundary, renderErrorBlock, handleError } from '../features/error.js';
import { _go } from '../features/router.js';

export const snap = (el) => {
  if (config.debug) console.log('[Lego Trace] snap() called for:', el.tagName);
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  const data = getPrivateData(el);
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];

  if (templateNode && !data.snapped) {
    data.snapped = true;
    const tpl = templateNode.content.cloneNode(true);

    // Support HMR/Re-init: Reuse output if exists
    let shadow = el.shadowRoot;
    if (shadow) shadow.innerHTML = ''; // Clear old content
    else shadow = el.attachShadow({ mode: 'open' });

    applyStyles(el);

    // TIER 1: Logic from Lego.block (Lego File)
    // TIER 2: Logic from the <template b-data="..."> attribute
    // TIER 3: Logic from the <my-comp b-data="..."> tag
    // SCOPED PROPS: Use parent block state as scope for instance logic evaluation
    const parentBlock = findAncestor(el, '*') || findAncestor(el.getRootNode().host, '*');
    const parentScope = parentBlock && parentBlock.state ? parentBlock.state : {};

    const scriptLogic = legoFileLogic.get(name) || {};
    const templateLogic = parseJSObject(templateNode.getAttribute('b-logic') || templateNode.getAttribute('b-data') || '{}');
    const instanceLogic = parseJSObject(el.getAttribute('b-logic') || el.getAttribute('b-data') || '{}', parentScope);

    // Note: We need to access $go and $route. We assume they are attached to globals or we import them.
    // Since globals is the shared object, we should reference accessors there.

    const baseState = {
      $vars: {},
      $element: el,
      get $parent() { return findAncestor(el, '*') },
      $emit: (name, detail) => {
        el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
      },
      get $route() { return globals.$route },
      get $go() { return globals.$go }
    };

    mergeDescriptors(scriptLogic, baseState);
    mergeDescriptors(templateLogic, baseState);
    mergeDescriptors(instanceLogic, baseState);

    el._studs = reactive(baseState, el);

    Object.defineProperty(el, 'state', {
      get() { return this._studs },
      set(v) { Object.assign(this._studs, v) },
      configurable: true,
      enumerable: false
    });

    shadow.appendChild(tpl);

    const style = shadow.querySelector('style');
    if (style) {
      style.textContent = style.textContent.replace(/\bself\b/g, ':host');
    }

    bind(shadow, el);
    activeBlocks.add(el);
    render(el);

    // Deeply initialize all nested components
    const nestedComponents = shadow.querySelectorAll('*');
    if (config.debug) console.log('[Lego Debug] Nested scan in', el.tagName, '- Found elements:', nestedComponents.length);
    nestedComponents.forEach(child => {
      const childTag = child.tagName.toLowerCase();
      const isRegistered = !!registry[childTag];
      if (isRegistered) {
        if (config.debug) console.log('[Lego Debug] Checking', childTag, '- Registered:', isRegistered);
      }
      if (isRegistered) snap(child);
    });

    // Track this shadow root for later component registration
    if (!el._legoShadow) el._legoShadow = shadow;

    if (typeof el._studs.mounted === 'function') {
      try {
        el._studs.mounted.call(el._studs);
      } catch (e) {
        handleError(e, el, 'mounted');
      }
    }
  }

  let provider = el.parentElement;
  while (provider && !provider._studs) provider = provider.parentElement;
  if (provider && provider._studs) bind(el, provider);

  [...el.children].forEach(snap);
};

export const unsnap = (el) => {
  // 1. Call unmounted lifecycle hook first
  if (el._studs && typeof el._studs.unmounted === 'function') {
    try {
      el._studs.unmounted.call(el._studs);
    } catch (e) {
      handleError(e, el, 'unmounted');
    }
  }

  // 2. Recursively unsnap children in shadowRoot
  if (el.shadowRoot) {
    [...el.shadowRoot.children].forEach(unsnap);
  }

  // 3. Remove from active blocks tracking
  activeBlocks.delete(el);
  globalSubscribers.delete(el);

  // 4. Break circular references
  if (el._studs) {
    // Clear element references in state object
    el._studs.$element = null;

    // Clear $vars references to DOM elements
    if (el._studs.$vars) {
      Object.keys(el._studs.$vars).forEach(key => {
        el._studs.$vars[key] = null;
      });
      el._studs.$vars = null;
    }

    // Clear closure-captured references
    if (el._studs.$emit) el._studs.$emit = null;
    delete el._studs.$parent;
    delete el._studs.$route;
    delete el._studs.$go;

    // Break the proxy -> element reference
    el._studs = null;
  }

  if (el.hasOwnProperty('state')) delete el.state;

  // 6. Clear private data
  const data = privateData.get(el);
  if (data) {
    if (data.bindings) {
      data.bindings.forEach(binding => {
        const directive = directives[binding.type];
        if (directive && directive.destroy) {
          try {
            directive.destroy({ binding });
          } catch (e) {
            console.error(`[Lego] Error in directive cleanup (${binding.type}):`, e);
          }
        }
        binding.node = null;
        binding.anchor = null;
      });
      data.bindings = null;
    }
    data.anchor = null;
    privateData.delete(el);
  }

  // 7. Clear from for-loop pools
  if (forPools.has(el)) {
    const pool = forPools.get(el);
    pool.forEach((node, key) => {
      if (node && node._studs) {
        node._studs = null;
      }
    });
    pool.clear();
    forPools.delete(el);
  }

  // 9. Recursively unsnap light DOM children
  [...el.children].forEach(unsnap);
};
