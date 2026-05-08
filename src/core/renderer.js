import { registry, forPools, itemIdMap, getPrivateData, globalSubscribers, globalKeySubscribers } from './registry.js';
import { globals } from './globals.js';
import { config, resolve, createRegex, getDelimiters } from '../utils/helpers.js';
import { safeEval } from '../utils/safe-eval.js';
import { findErrorBoundary, renderErrorBlock, handleError } from '../features/error.js';
import { directives } from '../directives/index.js';
import { findSyncAttr } from '../utils/dom.js';
import { setTracking, clearTracking } from './tracking.js';

export const bind = (container, blockRoot, loopCtx = null) => {
  const state = blockRoot._studs;

  const bindNode = (child) => {
    const childData = getPrivateData(child);
    if (childData.bound) return;

    if (child.hasAttributes()) {
      const attrs = child.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        if (attr.name.startsWith('@')) {
          const parts = attr.name.slice(1).split('.');
          const eventName = parts[0];
          const modifiers = parts.slice(1);

          const handler = (event) => {
            // Action Modifiers
            if (modifiers.includes('prevent')) event.preventDefault();
            if (modifiers.includes('stop')) event.stopPropagation();
            if (modifiers.includes('self') && event.target !== event.currentTarget) return;

            // Keyboard Modifiers
            if (typeof KeyboardEvent !== 'undefined' && event instanceof KeyboardEvent) {
              // System Keys (AND logic)
              if (modifiers.includes('ctrl') && !event.ctrlKey) return;
              if (modifiers.includes('alt') && !event.altKey) return;
              if (modifiers.includes('shift') && !event.shiftKey) return;
              if (modifiers.includes('meta') && !event.metaKey) return;

              // Key Matchers (OR logic for non-system/action modifiers)
              const keyModifiers = modifiers.filter(m =>
                !['prevent', 'stop', 'self', 'ctrl', 'alt', 'shift', 'meta', 'capture', 'once', 'passive'].includes(m)
              );

              if (keyModifiers.length > 0) {
                const pressed = event.key.toLowerCase();
                const isMatch = keyModifiers.some(mod => {
                  // Aliases
                  if (mod === 'enter') return pressed === 'enter';
                  if (mod === 'esc' || mod === 'escape') return pressed === 'escape';
                  if (mod === 'space') return pressed === ' ';
                  if (mod === 'tab') return pressed === 'tab';
                  if (mod === 'delete') return pressed === 'delete';
                  if (mod === 'backspace') return pressed === 'backspace';
                  if (mod === 'up') return pressed === 'arrowup';
                  if (mod === 'down') return pressed === 'arrowdown';
                  if (mod === 'left') return pressed === 'arrowleft';
                  if (mod === 'right') return pressed === 'arrowright';

                  // Categories
                  if (mod === 'alpha') return /^[a-z]$/.test(pressed);
                  if (mod === 'numbers') return /^[0-9]$/.test(pressed);

                  // Direct match (case-insensitive)
                  return mod === pressed;
                });
                if (!isMatch) return;
              }
            }
            try {
              let evalScope = state;
              if (loopCtx) {
                const list = safeEval(loopCtx.listName, { state, global: globals, self: blockRoot });
                const item = list[loopCtx.index];
                evalScope = Object.assign(Object.create(state), { [loopCtx.name]: item });
              }
              safeEval(attr.value, { state: evalScope, global: globals, self: child, event, $event: event }, true);
            } catch (err) {
              handleError(err, blockRoot, 'event-handler');
            }
          };
          child.addEventListener(eventName, handler);

          // Store reference for cleanup during teardown
          if (!childData.listeners) childData.listeners = [];
          childData.listeners.push({ eventName, handler });
        }
      }

      const syncAttr = findSyncAttr(child);
      if (syncAttr) {
        const prop = syncAttr.value;
        const modifiers = syncAttr.name.split('.').slice(1);
        const isLazy = modifiers.includes('lazy');
        const isNumber = modifiers.includes('number');
        const isTrim = modifiers.includes('trim');

        const updateState = () => {
          try {
            let target, last;
            if (prop.startsWith('global.')) {
              const keys = prop.slice(7).split('.');
              last = keys.pop();
              target = keys.reduce((o, k) => o[k], globals);
            } else if (loopCtx && prop.startsWith(`${loopCtx.name}.`)) {
              const list = safeEval(loopCtx.listName, { state, global: globals, self: blockRoot });
              const item = list[loopCtx.index];
              if (!item) return;
              const subPath = prop.split('.').slice(1);
              last = subPath.pop();
              target = subPath.reduce((o, k) => o[k], item);
            } else {
              const keys = prop.split('.');
              last = keys.pop();
              target = keys.reduce((o, k) => o[k], state);
            }
            let newVal = child.type === 'checkbox' ? child.checked : child.value;
            if (isTrim && typeof newVal === 'string') newVal = newVal.trim();
            if (isNumber) {
              const parsed = parseFloat(newVal);
              if (!isNaN(parsed)) newVal = parsed;
            }
            if (target && target[last] !== newVal) target[last] = newVal;
          } catch (err) {
            config.onError(err, 'sync-update', child);
          }
        };
        child._bSyncHandler = updateState;
        if (!childData.listeners) childData.listeners = [];
        if (!isLazy) {
          child.addEventListener('input', updateState);
          childData.listeners.push({ eventName: 'input', handler: updateState });
        }
        child.addEventListener('change', updateState);
        childData.listeners.push({ eventName: 'change', handler: updateState });
      }

      // b-var: Register element reference
      if (child.hasAttribute('b-var')) {
        const varName = child.getAttribute('b-var');
        if (state.$vars) {
          state.$vars[varName] = child;
        }
      }
    }
    childData.bound = true;
  };

  if (container instanceof Element) bindNode(container);

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  let child;
  while (child = walker.nextNode()) bindNode(child);
};

export const scanForBindings = (container, subscriberTarget = null) => {
  // Audit fix #14: recursive walk that skips terminal-directive subtrees
  // (notably b-for) outright, instead of TreeWalker-descending then
  // climbing parents per node to detect the boundary. Eliminates the
  // O(nodes × depth) `isInsideBoundary` scan and the wasted descent into
  // b-for subtrees the parent block never owns. Closure invariants
  // (delimiter, subscriber target, directive list) hoist out of the loop.
  const bindings = [];
  const pendingOperations = [];
  const [delimStart] = getDelimiters();
  const subscriberRoot = subscriberTarget || container.host || container;
  const directiveEntries = Object.entries(directives);

  // Audit fix #20: extract the *top-level* global keys an expression
  // touches and register the subscriber against each one. Falls back to
  // the wildcard set when the access pattern is too dynamic to pin
  // down (computed/bracket access, deep dotted paths — the proxy can't
  // surface a top-level key from a nested mutation, so any nested-read
  // subscriber must wake on every global change to stay correct).
  const TOP_KEY = /\bglobal\.([\w$]+)([\w$.]*)/g;
  const checkGlobal = (str) => {
    if (!/\bglobal\b/.test(str)) return;
    let useWildcard = false;
    const keys = new Set();
    let m;
    TOP_KEY.lastIndex = 0;
    while ((m = TOP_KEY.exec(str)) !== null) {
      const tail = m[2] || '';
      if (tail.includes('.')) { useWildcard = true; break; }
      keys.add(m[1]);
    }
    // If the regex didn't match anything but `global` is in the string
    // (e.g. `global['x']` or a computed access), play safe with the
    // wildcard set.
    if (keys.size === 0) useWildcard = true;
    if (useWildcard) {
      globalSubscribers.add(subscriberRoot);
      return;
    }
    keys.forEach(k => {
      let set = globalKeySubscribers.get(k);
      if (!set) { set = new Set(); globalKeySubscribers.set(k, set); }
      set.add(subscriberRoot);
    });
  };

  const visit = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      let isTerminal = false;
      for (const [, implementation] of directiveEntries) {
        if (!implementation.scan) continue;
        const result = implementation.scan(node, {
          checkGlobal,
          getPrivateData,
          pendingOperations,
          current: node
        });
        if (result) {
          bindings.push(result);
          if (result.terminal) isTerminal = true;
        }
      }

      if (isTerminal) return;

      for (const attr of node.attributes) {
        if (attr.value.includes(delimStart)) {
          checkGlobal(attr.value);
          bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
        }
      }

      for (let child = node.firstChild; child; child = child.nextSibling) {
        visit(child);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.includes(delimStart)) {
        checkGlobal(node.textContent);
        bindings.push({ type: 'text', node, template: node.textContent });
      }
    }
  };

  // The container itself may carry text/attr interpolations (e.g. b-for's
  // cloned child `<li b-for="x in items" class="row [[x.active]]">`). The
  // prior `updateNodeBindings` call processed the root separately; folding
  // it into scanForBindings keeps a single unified pass. Skip directive
  // scanning on the root — directives there are a separate concern (and
  // for the main render path the container is a ShadowRoot with no attrs,
  // so this is a no-op).
  if (container.nodeType === Node.ELEMENT_NODE) {
    for (const attr of container.attributes) {
      if (attr.value.includes(delimStart)) {
        checkGlobal(attr.value);
        bindings.push({ type: 'attr', node: container, attrName: attr.name, template: attr.value });
      }
    }
  } else if (container.nodeType === Node.TEXT_NODE) {
    if (container.textContent.includes(delimStart)) {
      checkGlobal(container.textContent);
      bindings.push({ type: 'text', node: container, template: container.textContent });
    }
  }

  for (let child = container.firstChild; child; child = child.nextSibling) {
    visit(child);
  }

  pendingOperations.forEach(op => op());

  return bindings;
};

/**
 * Execute a single binding against a given state scope. Extracted so b-for
 * can reuse the same path for per-item directive execution (so inner
 * b-if / b-show / b-html / b-mount / b-enter / b-leave work inside loops).
 *
 * Wraps execution with setTracking/clearTracking so the reactive proxy
 * records which (target, key) pairs this binding reads — enabling
 * fine-grained re-runs on subsequent state mutations (#16).
 *
 * `track=false` is used by b-for for inner-loop bindings: those bindings
 * receive a per-item localScope (Object.create(state) + item) and can't be
 * re-run individually on a mutation because we'd have lost which item their
 * scope referred to. Leaving tracking active under the *outer* b-for
 * binding means any state read during the loop becomes a dep of the b-for
 * binding, so a mutation triggers the whole loop to re-iterate. Coarser
 * than per-item reactivity but correct.
 */
const runBinding = (b, state, contextEl, track = true) => {
  // Audit fix #9: bindings whose nodes were wiped (e.g. b-html replaced the
  // surrounding subtree) are tagged dead during the wipe. Skip them so we
  // don't write to detached nodes through the dirty-binding path.
  if (b.dead) return;
  if (track) setTracking(b, contextEl);
  try {
    const directive = directives[b.type];
    if (directive) {
      directive.execute({
        binding: b,
        state,
        global: globals,
        helpers: {
          bind,
          scanForBindings,
          runBinding,
          contextEl
        }
      });
      return;
    }
    if (b.type === 'text') {
      const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
      if (b.node.textContent !== out) b.node.textContent = out;
    } else if (b.type === 'attr') {
      const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
      if (b.node.getAttribute(b.attrName) !== out) {
        b.node.setAttribute(b.attrName, out);
        if (b.attrName === 'class') b.node.className = out;
      }
    }
  } finally {
    if (track) clearTracking();
  }
};

export const render = (el) => {
  if (config.debug) console.log('[Lego Trace] render() called for:', el.tagName);
  const state = el._studs;
  if (!state) return;
  const data = getPrivateData(el);
  if (data.rendering) return;
  data.rendering = true;
  if (config.metrics && config.metrics.onRenderStart) config.metrics.onRenderStart(el);

  try {
    // Use shadowRoot if it's a block, otherwise render the element itself (light DOM)
    const target = el.shadowRoot || el;
    if (!data.bindings) data.bindings = scanForBindings(target);

    // Fine-grained re-render: if the proxy `set` recorded specific dirty
    // bindings, run only those. Otherwise (initial render, untracked path,
    // delete) run the full pass. dirtyBindings is consumed and cleared.
    if (data.dirtyBindings && data.dirtyBindings.size > 0) {
      const dirty = data.dirtyBindings;
      data.dirtyBindings = null;
      dirty.forEach(b => runBinding(b, state, el));
    } else {
      data.bindings.forEach(b => runBinding(b, state, el));
    }
  } catch (err) {
    handleError(err, el, 'render');
  } finally {
    if (config.metrics && config.metrics.onRenderEnd) config.metrics.onRenderEnd(el);
    data.rendering = false;
  }
};
