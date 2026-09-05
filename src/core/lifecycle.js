import { registry, legoFileLogic, sharedStates, activeBlocks, getPrivateData, privateData, snapState } from './registry.js';
import { bProps } from '../directives/b-props.js';
import { globals } from './globals.js';
import { directives } from '../directives/index.js';
import { config, mergeDescriptors, resolve, isNode } from '../utils/helpers.js';
import { findAncestor } from '../utils/dom.js';
import { cleanupDbBindings } from '../features/persistence.js';
import { parseJSObject } from '../utils/safe-eval.js';
import { reactive } from './reactive.js';
import { computed, watch } from './effect.js';
import { bind, render } from './renderer.js';
import { applyStyles, adoptLightStyle } from './stylesheets.js';
import { findErrorBoundary, renderErrorBlock, handleError, guardResult } from '../features/error.js';
import { createFormApi, syncFormValue } from '../features/form.js';
import { _go } from '../features/router.js';

// Audit fix #24: `el.state = X` performs a shallow merge (Object.assign),
// not a replacement. Warn once per session so authors who expect
// assignment semantics (`=` looks like assignment, after all) discover
// the actual behaviour without flooding logs in steady-state apps.
let _stateAssignWarned = false;

/**
 * Turn author-written getters into cached computeds.
 *
 * A getter is derived state, and re-running it on every read is waste that
 * shows up as soon as the body is non-trivial. Backing each one with a
 * computed means it recomputes only when something it read actually changed,
 * and the computed itself becomes the thing bindings depend on.
 *
 * Only accessors that came from the three logic tiers are converted. The
 * framework's own `$parent` / `$route` / `$go` / `$mount` accessors on
 * baseState must stay live: they read the DOM and the router, neither of
 * which is reactive, so caching them would freeze them at their first value.
 *
 * `getProxy` is deferred because the state proxy does not exist yet at the
 * point of conversion, and the original getter has to run with `this` bound
 * to it or its own reads would never be tracked.
 *
 * @returns {Array} the computeds created, so unsnap can stop them
 */
const memoizeGetters = (baseState, sources, getProxy) => {
  const authored = new Set();
  sources.forEach(src => {
    if (src) Object.getOwnPropertyNames(src).forEach(k => authored.add(k));
  });

  const owned = [];
  authored.forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(baseState, key);
    if (!desc || !desc.get) return;
    const original = desc.get;
    const cell = computed(() => original.call(getProxy() || baseState));
    owned.push(cell);
    Object.defineProperty(baseState, key, {
      get() { return cell.value; },
      set: desc.set,
      enumerable: desc.enumerable,
      configurable: true
    });
  });
  return owned;
};

/**
 * Emulate `<slot>` for a block that renders into the light DOM.
 *
 * There is no shadow root to do the projection, so the nodes that were the
 * element's own children before the template landed are moved into the slot
 * that names them and the `<slot>` wrapper is unwrapped. A slot nothing was
 * assigned to keeps its own children, which is exactly fallback content.
 *
 * The moved nodes are marked `slotted`: they were written by, scanned by and
 * belong to whichever block owns the surrounding template, and the block they
 * have just landed inside must not bind them a second time.
 *
 * @param {HTMLElement} el - the light-DOM block
 * @param {DocumentFragment} content - its original children
 */
const projectSlots = (el, content) => {
  const groups = new Map();
  [...content.childNodes].forEach(node => {
    const name = (node.getAttribute && node.getAttribute('slot')) || '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(node);
    getPrivateData(node).slotted = true;
  });

  el.querySelectorAll('slot').forEach(slotEl => {
    const assigned = groups.get(slotEl.getAttribute('name') || '');
    const replacement = (assigned && assigned.length > 0) ? assigned : [...slotEl.childNodes];
    slotEl.replaceWith(...replacement);
  });
};

/**
 * Rewrite `self` to `:host` in a shadow block's <style>.
 *
 * Audit fix #38: don't reach into strings or comments. Previously the raw
 * substitution turned `content: "self"` into `content: ":host"` and similarly
 * mangled custom-property values that legitimately contained the bareword
 * `self`. Stash strings and comments behind sentinel placeholders, run the
 * rewrite, then restore. Doesn't attempt to distinguish selector context from
 * value context (that would require a real CSS parser) but covers the common
 * foot-guns.
 */
const rewriteHostSelectors = (style) => {
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
};

/**
 * Apply the prop contract to a freshly merged state object.
 *
 * Order is deliberate. Declared defaults fill only what nothing else supplied,
 * then the parent's `:prop` bindings (stashed on the element while it was
 * still unsnapped) win over them, then plain attributes land last because an
 * attribute is the most explicit thing an author can write on the tag itself.
 *
 * Props are ordinary state keys from here on: the block may write them, and
 * the parent's next effect run overwrites what it wrote. Data flows one way.
 */
const applyProps = (el, tagName, state) => {
  bProps.applyDefaults(tagName, state);
  if (el._pendingProps) {
    Object.assign(state, el._pendingProps);
    delete el._pendingProps;
  }
  bProps.applyAttributes(el, tagName, state);
};

/**
 * Watch the attributes a lazily defined block declares as props.
 *
 * `observedAttributes` is read once, when the element class is defined. A
 * manifest block's class is defined before its .lego has been fetched, so its
 * prop names were not known then and the platform will never call
 * `attributeChangedCallback` for them. One observer per instance, filtered to
 * exactly the names the class missed, closes that gap.
 */
const observeLateProps = (el, tagName, data) => {
  const attrs = bProps.attrs(tagName);
  if (attrs.length === 0 || typeof MutationObserver === 'undefined') return;
  const observed = el.constructor.observedAttributes || [];
  const missing = attrs.filter(a => observed.indexOf(a) === -1);
  if (missing.length === 0) return;

  const observer = new MutationObserver(records => {
    records.forEach(r => bProps.applyAttribute(el, tagName, r.attributeName));
  });
  observer.observe(el, { attributes: true, attributeFilter: missing });
  data.attrObserver = observer;
};

/**
 * Give a block with an async `mounted()` an observable pending flag.
 *
 * `$loading` exists only while the promise is in flight, and only on blocks
 * whose mounted() actually returned one, so a synchronous block never gains
 * the key and templates that never await never see it.
 */
const markLoading = (el, result) => {
  if (!result || typeof result.then !== 'function') return;
  el._studs.$loading = true;
  const settle = () => {
    if (el._studs) el._studs.$loading = false;
  };
  result.then(settle, settle);
};

export const snap = (el) => {
  if (config.debug) console.log('[Lego Trace] snap() called for:', el.tagName);
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  const data = getPrivateData(el);
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];

  if (templateNode && !data.snapped) {
    data.snapped = true;
    const tpl = templateNode.content.cloneNode(true);

    // `b-shadow="false"` renders into the element itself. Global stylesheets,
    // ARIA id references and native form submission all reach into a light
    // DOM block; nothing reaches into a shadow one.
    const useShadow = templateNode.getAttribute('b-shadow') !== 'false';
    let shadow = el;
    let slotContent = null;
    if (useShadow) {
      // Support HMR/Re-init: Reuse output if exists
      shadow = el.shadowRoot || el.attachShadow({ mode: 'open' });
      shadow.innerHTML = '';
    } else {
      data.lightDom = true;
      // Whatever the element already contained is its slot content. Detach it
      // before the template lands so the two never mix.
      slotContent = document.createDocumentFragment();
      while (el.firstChild) slotContent.appendChild(el.firstChild);
    }

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
      /**
       * Run a callback when a piece of state changes, without going through
       * the template. `source` is a dotted key path or a function receiving
       * the state proxy. Stopped automatically on unmount; the returned stop
       * function works before then.
       */
      $watch: (source, cb, options) => {
        const stop = watch(source, cb, options, el._studs);
        data.watchers.push(stop);
        return stop;
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

    if (el._internals) baseState.$form = createFormApi(el._internals);

    applyProps(el, name, baseState);
    bProps.validate({ instanceLogic, state: baseState, tagName: name });

    data.watchers = [];
    data.computeds = memoizeGetters(
      baseState,
      [scriptLogic, templateLogic, instanceLogic],
      () => el._studs
    );

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

    // A form block publishes state.value as the value the form submits.
    // Captured up front so formResetCallback has something to restore to.
    if (el._internals && Object.prototype.hasOwnProperty.call(baseState, 'value')) {
      data.initialValue = baseState.value;
      data.watchers.push(watch(
        'value',
        (v) => syncFormValue(el._internals, v),
        { immediate: true },
        el._studs
      ));
    }

    observeLateProps(el, name, data);

    // Suppress child connectedCallbacks during appendChild so children
    // don't snap before this parent's mounted() hook has run.
    snapState.locked = true;
    try {
      shadow.appendChild(tpl);
      if (slotContent) projectSlots(el, slotContent);
    } finally {
      snapState.locked = false;
    }

    const style = shadow.querySelector('style');
    if (style && useShadow) rewriteHostSelectors(style);
    if (style && !useShadow) adoptLightStyle(name, style);

    bind(shadow, el);
    activeBlocks.add(el);
    render(el);
    el.setAttribute('b-id', name);

    // Track this shadow root for later component registration
    if (useShadow && !el._legoShadow) el._legoShadow = shadow;

    // Fire mounted() BEFORE snapping children so child components
    // can read any state the parent sets during mounted().
    if (typeof el._studs.mounted === 'function') {
      try {
        // guardResult: an `async mounted()` rejects instead of throwing, so
        // the catch below would never see it.
        markLoading(el, guardResult(el._studs.mounted.call(el._studs), el, 'mounted'));
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

  // 2. Remove stored event listeners from the block's render root. A
  // light-DOM block renders into itself, so that root is the element.
  const existing = privateData.get(el);
  const renderRoot = el.shadowRoot || (existing && existing.lightDom ? el : null);
  if (renderRoot) {
    const walker = document.createTreeWalker(renderRoot, NodeFilter.SHOW_ELEMENT);
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
  }
  // Recursively unsnap children in shadowRoot. Light-DOM children are covered
  // by step 7, which walks el.children for every block.
  if (el.shadowRoot) [...el.shadowRoot.children].forEach(unsnap);

  // 3. Clean up persistence bindings
  cleanupDbBindings(el);

  // 4. Remove from active blocks tracking
  activeBlocks.delete(el);

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
        // Stop first: a directive's destroy() can mutate state, and a live
        // effect would happily schedule a block that is on its way out.
        if (binding.effect) {
          binding.effect.stop();
          binding.effect = null;
        }
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
    if (data.watchers) {
      data.watchers.forEach(stop => stop());
      data.watchers = null;
    }
    if (data.computeds) {
      data.computeds.forEach(cell => cell.stop());
      data.computeds = null;
    }
    if (data.attrObserver) {
      data.attrObserver.disconnect();
      data.attrObserver = null;
    }
    data.dirtyBindings = null;
    data.anchor = null;
    privateData.delete(el);
  }

  // 7. Recursively unsnap light DOM children
  [...el.children].forEach(unsnap);
};
