import { registry, forPools, itemIdMap, getPrivateData } from './registry.js';
import { globals } from './globals.js';
import { config, resolve, createRegex, getDelimiters } from '../utils/helpers.js';
import { safeEval } from '../utils/safe-eval.js';
import { findErrorBoundary, renderErrorBlock, handleError, guardResult } from '../features/error.js';
import { directives } from '../directives/index.js';
import { findSyncAttr, URL_ATTRS, isDangerousUrl } from '../utils/dom.js';
import { createEffect } from './effect.js';
import { globalBatcher } from './batcher.js';

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
              // guardResult: an `async` handler returns a rejected promise
              // rather than throwing, so the catch below never sees it.
              guardResult(
                safeEval(attr.value, { state: evalScope, global: globals, self: child, event, $event: event }, true),
                blockRoot,
                'event-handler'
              );
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

export const scanForBindings = (container) => {
  // Audit fix #14: recursive walk that skips terminal-directive subtrees
  // (notably b-for) outright, instead of TreeWalker-descending then
  // climbing parents per node to detect the boundary. Eliminates the
  // O(nodes x depth) `isInsideBoundary` scan and the wasted descent into
  // b-for subtrees the parent block never owns. Closure invariants
  // (delimiter, directive list) hoist out of the loop.
  //
  // Nothing here inspects expression source text any more: which state or
  // global keys a binding depends on is discovered at run time, by the
  // effect that runs it.
  const bindings = [];
  const pendingOperations = [];
  const [delimStart] = getDelimiters();
  const directiveEntries = Object.entries(directives);

  const visit = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      let isTerminal = false;
      for (const [, implementation] of directiveEntries) {
        if (!implementation.scan) continue;
        const result = implementation.scan(node, {
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
          bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
        }
      }

      for (let child = node.firstChild; child; child = child.nextSibling) {
        visit(child);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.includes(delimStart)) {
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
        bindings.push({ type: 'attr', node: container, attrName: attr.name, template: attr.value });
      }
    }
  } else if (container.nodeType === Node.TEXT_NODE) {
    if (container.textContent.includes(delimStart)) {
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
 * The work a binding does: run its directive, or write its interpolated text
 * or attribute. Always called from inside the binding's own effect, so every
 * state, global or `$registry` read it performs becomes a dependency of that
 * one binding.
 */
const executeBinding = (b, state, contextEl) => {
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
        runBindings,
        contextEl
      }
    });
    return;
  }
  if (b.type === 'text') {
    const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
    if (b.node.textContent !== out) b.node.textContent = out;
    return;
  }
  if (b.type === 'attr') {
    const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
    if (config.strict && URL_ATTRS.has(b.attrName.toLowerCase()) && isDangerousUrl(out)) {
      if (b.node.hasAttribute(b.attrName)) b.node.removeAttribute(b.attrName);
      return;
    }
    if (b.node.getAttribute(b.attrName) !== out) {
      b.node.setAttribute(b.attrName, out);
      if (b.attrName === 'class') b.node.className = out;
    }
  }
};

/**
 * A changed dependency does not re-run the binding on the spot: it marks the
 * binding dirty on its host block and asks the batcher for a frame. render()
 * then runs exactly the dirty set, so a burst of mutations still costs one
 * pass and DOM writes stay inside the frame.
 */
const scheduleBinding = (b, contextEl) => {
  const data = getPrivateData(contextEl);
  if (!data.dirtyBindings) data.dirtyBindings = new Set();
  data.dirtyBindings.add(b);
  globalBatcher.add(contextEl);
};

/**
 * Execute a single binding, creating its effect on first use. Extracted so
 * b-for can reuse the same path for per-item directive execution (so inner
 * b-if / b-show / b-html / b-mount / b-enter / b-leave work inside loops).
 *
 * The effect closes over the scope the binding was first run with. For block
 * bindings that is the block's state proxy; for b-for row bindings it is the
 * row's persistent `_loopScope`, which is why a row can be re-run on its own
 * without having lost which item it was showing.
 */
const runBinding = (b, state, contextEl) => {
  // Audit fix #9: bindings whose nodes are gone are tagged dead by whoever
  // removed them, either b-html replacing the surrounding subtree or b-for
  // evicting a row from its pool. Skip them: they may still be sitting in
  // the dirty set from a mutation made earlier in the same frame, and
  // running one would write to a detached node and, worse, mint a fresh
  // effect for it against the wrong scope.
  if (b.dead) return;
  if (!b.effect) {
    b.effect = createEffect(
      () => executeBinding(b, state, contextEl),
      () => scheduleBinding(b, contextEl)
    );
  }
  b.effect.run();
};

/**
 * A directive may declare `phase: 'post'` to opt out of document-order
 * execution and run after every other binding in the same pass. Used by
 * b-sync, whose target value depends on DOM (b-for generated <option>s)
 * that later bindings create.
 */
const isPostBinding = (b) => {
  const directive = directives[b.type];
  return !!(directive && directive.phase === 'post');
};

/**
 * Run a binding list in two phases: document order first, then everything a
 * directive marked `phase: 'post'`. Accepts an Array or a Set (the
 * dirty-binding path hands us a Set).
 *
 * The post list is allocated lazily so the common case (no post bindings on
 * this node) stays allocation free, which matters because b-for calls this
 * once per row per render.
 *
 * `onError`, when supplied, isolates each binding: a throw is reported and
 * the remaining bindings still run. Without it a throw propagates to the
 * caller (render() turns it into a boundary/onError report for the block).
 */
export const runBindings = (bindings, state, contextEl, onError = null) => {
  let post = null;
  const run = (b) => {
    if (!onError) {
      runBinding(b, state, contextEl);
      return;
    }
    try {
      runBinding(b, state, contextEl);
    } catch (err) {
      onError(err, b);
    }
  };
  bindings.forEach(b => {
    if (isPostBinding(b)) {
      if (!post) post = [];
      post.push(b);
      return;
    }
    run(b);
  });
  if (post) post.forEach(run);
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

    // Fine-grained re-render: a binding whose dependency changed put itself
    // in the dirty set, so run only those and let each effect re-collect its
    // deps. The full pass is the first render (which is what creates the
    // effects) and any render asked for without a dirty set.
    if (data.dirtyBindings && data.dirtyBindings.size > 0) {
      const dirty = data.dirtyBindings;
      data.dirtyBindings = null;
      runBindings(dirty, state, el);
    } else {
      runBindings(data.bindings, state, el);
    }
  } catch (err) {
    handleError(err, el, 'render');
  } finally {
    if (config.metrics && config.metrics.onRenderEnd) config.metrics.onRenderEnd(el);
    data.rendering = false;
  }
};
