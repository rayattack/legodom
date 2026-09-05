import { registry, legoFileLogic, sharedStates, activeBlocks, getPrivateData, globalSubscribers, globalKeySubscribers, privateData, snapState } from './registry.js';
import { bProps } from '../directives/b-props.js';
import { globals } from './globals.js';
import { directives } from '../directives/index.js';
import { config, mergeDescriptors, resolve, isNode } from '../utils/helpers.js';
import { findAncestor } from '../utils/dom.js';
import { cleanupDbBindings } from '../features/persistence.js';
import { parseJSObject } from '../utils/safe-eval.js';
import { reactive } from './reactive.js';
import { bind, render } from './renderer.js';
import { applyStyles } from './stylesheets.js';
import { findErrorBoundary, renderErrorBlock, handleError, guardResult } from '../features/error.js';
import { _go } from '../features/router.js';

// Audit fix #24: `el.state = X` performs a shallow merge (Object.assign),
// not a replacement. Warn once per session so authors who expect
// assignment semantics (`=` looks like assignment, after all) discover
// the actual behaviour without flooding logs in steady-state apps.
let _stateAssignWarned = false;

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
    // TIER 2: Logic from the <template b-logic="..."> attribute
    // TIER 3: Logic from the <my-comp b-logic="..."> tag
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
      get $go() { return globals.$go },
      get $mount() { return globals.$mount }
    };

    mergeDescriptors(scriptLogic, baseState);
    mergeDescriptors(templateLogic, baseState);
    mergeDescriptors(instanceLogic, baseState);

    // Support injection of initial state (e.g. from error boundaries)
    if (el.$initialState) {
      mergeDescriptors(el.$initialState, baseState);
      delete el.$initialState; // Cleanup
    }

    bProps.validate({ instanceLogic, state: baseState, tagName: name });

    el._studs = reactive(baseState, el);

    Object.defineProperty(el, 'state', {
      get() { return this._studs },
      set(v) {
        if (!_stateAssignWarned) {
          _stateAssignWarned = true;
          console.warn(
            '[Lego] `el.state = X` performs a shallow merge (Object.assign), ' +
            'not a replacement. Keys present on state but absent from X are ' +
            'preserved. Mutate state keys directly if you want this behaviour ' +
            'or remount the element to start fresh.'
          );
        }
        Object.assign(this._studs, v);
      },
      configurable: true,
      enumerable: false
    });

    // Suppress child connectedCallbacks during appendChild so children
    // don't snap before this parent's mounted() hook has run.
    snapState.locked = true;
    try {
      shadow.appendChild(tpl);
    } finally {
      snapState.locked = false;
    }

    const style = shadow.querySelector('style');
    if (style) {
      // Audit fix #38: don't reach into strings or comments. Previously the
      // raw substitution turned `content: "self"` into `content: ":host"`
      // and similarly mangled custom-property values that legitimately
      // contained the bareword `self`. Stash strings + comments behind
      // sentinel placeholders, run the rewrite, then restore. Doesn't
      // attempt to distinguish selector context from value context — that
      // would require a real CSS parser — but covers the common foot-guns.
      const segments = [];
      // Multi-char sentinel that never appears in normal CSS source.
      const SENTINEL = '__LEGO_SEG_';
      const protectedCss = style.textContent.replace(
        /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (m) => {
          segments.push(m);
          return `${SENTINEL}${segments.length - 1}__`;
        }
      );
      const rewritten = protectedCss.replace(/(?<![-\w])self(?![-\w])/g, ':host');
      style.textContent = rewritten.replace(
        /__LEGO_SEG_(\d+)__/g,
        (_, idx) => segments[+idx]
      );
    }

    bind(shadow, el);
    activeBlocks.add(el);
    render(el);
    el.setAttribute('b-id', name);

    // Track this shadow root for later component registration
    if (!el._legoShadow) el._legoShadow = shadow;

    // Fire mounted() BEFORE snapping children so child components
    // can read any state the parent sets during mounted().
    if (typeof el._studs.mounted === 'function') {
      try {
        // guardResult: an `async mounted()` rejects instead of throwing, so
        // the catch below would never see it.
        guardResult(el._studs.mounted.call(el._studs), el, 'mounted');
      } catch (e) {
        handleError(e, el, 'mounted');
      }
    }

    // Deeply initialize all nested components (after mounted)
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
      guardResult(el._studs.unmounted.call(el._studs), el, 'unmounted');
    } catch (e) {
      handleError(e, el, 'unmounted');
    }
  }

  // 2. Remove stored event listeners from shadow root elements
  if (el.shadowRoot) {
    const walker = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      const nodeData = privateData.get(node);
      if (nodeData && nodeData.listeners) {
        nodeData.listeners.forEach(({ eventName, handler }) => {
          node.removeEventListener(eventName, handler);
        });
        nodeData.listeners = null;
      }
    }
    // Recursively unsnap children in shadowRoot
    [...el.shadowRoot.children].forEach(unsnap);
  }

  // 3. Clean up persistence bindings
  cleanupDbBindings(el);

  // 4. Remove from active blocks tracking
  activeBlocks.delete(el);
  globalSubscribers.delete(el);
  // Audit fix #20: also drop el from each per-key subscriber set.
  // Iterating the map is bounded by the number of distinct global keys
  // ever subscribed (small in practice).
  globalKeySubscribers.forEach(set => set.delete(el));

  // 5. Break circular references
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
    delete el._studs.$mount;

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

  // 7. Recursively unsnap light DOM children
  [...el.children].forEach(unsnap);
};
