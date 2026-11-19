import { registry, forPools, itemIdMap, getPrivateData, privateData } from './registry.js';
import { appOf, defaultApp } from './globals.js';
import { resolve, createRegex, getDelimiters, camelCase, bindsAsProp, boundAttrText } from '../utils/helpers.js';
import { safeEval } from '../utils/safe-eval.js';
import { findErrorBoundary, renderErrorBlock, handleError, guardResult } from '../features/error.js';
import { directives } from '../directives/index.js';
import { findSyncAttr, URL_ATTRS, isDangerousUrl } from '../utils/dom.js';
import { createEffect } from './effect.js';
import { globalBatcher } from './batcher.js';

/**
 * The binding a `:name="expr"` attribute becomes. On a block (or a tag that
 * may become one) it is a prop; on a built-in element it binds the attribute.
 * Shared with hydrate.js, which scans the same attributes off the template.
 */
export const colonBinding = (node, attr) => {
  const name = attr.name.slice(1);
  if (registry[node.tagName.toLowerCase()] || bindsAsProp(node.tagName.toLowerCase())) {
    return { type: 'prop', node, prop: camelCase(name), expr: attr.value };
  }
  return { type: 'bind', node, attrName: name, expr: attr.value };
};

/**
 * These three follow their attribute only until the user touches the control,
 * so the live property is written too. Every write compares first, which is
 * what keeps a hydrated page at zero DOM writes.
 */
const LIVE_PROPERTIES = new Set(['value', 'checked', 'selected']);

const writeBoundAttr = (node, name, value, app) => {
  let text = boundAttrText(name, value);
  if (text !== null && app.config.strict && URL_ATTRS.has(name) && isDangerousUrl(text)) text = null;
  if (text === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== text) {
    node.setAttribute(name, text);
  }
  if (!LIVE_PROPERTIES.has(name) || !(name in node)) return;
  const live = name === 'value' ? (text === null ? '' : text) : text !== null;
  if (node[name] !== live) node[name] = live;
};

export const bind = (container, blockRoot, loopCtx = null) => {
  const state = blockRoot._studs;
  // Handlers outlive this call, so the app is resolved once here rather than
  // per event: the block's app cannot change while the block is mounted.
  const app = appOf(blockRoot);
  const globals = app.globals;

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
            if (modifiers.includes('self') && event.target !== event.currentTarget) return;

            // Keyboard Modifiers decide whether this event is ours at all. Only
            // an event that passes them is acted on, so `.prevent` and `.stop`
            // never touch the keys the handler ignores: `@keydown.enter.prevent`
            // must not swallow every ordinary keystroke in the input.
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

            // Action Modifiers, applied only to an event the handler fires for
            if (modifiers.includes('prevent')) event.preventDefault();
            if (modifiers.includes('stop')) event.stopPropagation();
            try {
              // A b-for row's handler runs in the row's own scope: the item it
              // shows and its `$index`, kept current by b-for on every pass,
              // with the block state behind them. That is the item the user
              // clicked, even if the list has moved since the last render.
              // The rebuilt scope is the fallback for a row b-for has not run.
              let evalScope = state;
              if (loopCtx) {
                evalScope = container._loopScope;
                if (!evalScope) {
                  const list = safeEval(loopCtx.listName, { state, global: globals, self: blockRoot, app });
                  evalScope = Object.assign(Object.create(state), {
                    [loopCtx.name]: list[loopCtx.index],
                    $index: loopCtx.index
                  });
                }
              }
              // guardResult: an `async` handler returns a rejected promise
              // rather than throwing, so the catch below never sees it.
              guardResult(
                safeEval(attr.value, { state: evalScope, global: globals, self: child, event, $event: event, app }, true),
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
              const list = safeEval(loopCtx.listName, { state, global: globals, self: blockRoot, app });
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
            app.config.onError(err, 'sync-update', child);
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

export const scanForBindings = (container, skipRootAttrs = false, app = defaultApp) => {
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
  const [delimStart] = getDelimiters(app.config);
  const directiveEntries = Object.entries(directives);

  const visit = (node) => {
    // Nodes a light-DOM block moved into one of its slots were written,
    // scanned and are owned by the block whose template they came from.
    // Whoever is scanning now is not that block.
    const nodeData = privateData.get(node);
    if (nodeData && nodeData.slotted) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.includes(delimStart)) {
        bindings.push({ type: 'text', node, template: node.textContent });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

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
      // `:name="expr"` is never an interpolated attribute, whatever its value
      // contains. On a block it is the parent-to-child prop channel; on a
      // built-in element it binds the attribute (see bindsAsProp).
      if (attr.name[0] === ':' && attr.name.length > 1) {
        bindings.push(colonBinding(node, attr));
        continue;
      }
      if (attr.value.includes(delimStart)) {
        bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
      }
    }

    // A light-DOM block that has already snapped rendered its own template
    // into itself. Those nodes are its bindings, so descent stops here; its
    // attributes above (props, events, interpolations) still belong to us.
    if (nodeData && nodeData.lightDom) return;

    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };

  // The container itself may carry text/attr interpolations (e.g. b-for's
  // cloned child `<li b-for="x in items" class="row [[x.active]]">`). The
  // prior `updateNodeBindings` call processed the root separately; folding
  // it into scanForBindings keeps a single unified pass. Skip directive
  // scanning on the root: directives there are a separate concern (and
  // for the main render path the container is a ShadowRoot with no attrs,
  // so this is a no-op).
  //
  // `skipRootAttrs` is how a light-DOM block declines its own host
  // attributes: it renders into itself, so the container is the element, and
  // anything written on that tag was written by the parent block.
  //
  // A b-for row is such a container, so `:name` on the looped element itself
  // (`<user-card b-for="u in users" :user="u">`) is bound here too.
  if (container.nodeType === Node.ELEMENT_NODE && !skipRootAttrs) {
    for (const attr of container.attributes) {
      if (attr.name[0] === ':' && attr.name.length > 1) {
        bindings.push(colonBinding(container, attr));
        continue;
      }
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
const executeBinding = (b, state, contextEl, app) => {
  const globals = app.globals;
  const directive = directives[b.type];
  if (directive) {
    directive.execute({
      binding: b,
      state,
      global: globals,
      app,
      helpers: {
        bind,
        scanForBindings,
        runBinding,
        runBindings,
        reviveBindings,
        contextEl
      }
    });
    return;
  }
  // A prop binding is the parent's effect: the expression is evaluated
  // against the parent's scope, so the parent re-runs it when its own state
  // changes, and the child sees an ordinary state write. A child that has not
  // snapped yet has nowhere to receive the value, so it is stashed and snap()
  // merges it in.
  if (b.type === 'prop') {
    const value = safeEval(b.expr, { state, global: globals, self: b.node, app }, false);
    if (b.node._studs) {
      b.node._studs[b.prop] = value;
      return;
    }
    const pending = b.node._pendingProps || (b.node._pendingProps = {});
    pending[b.prop] = value;
    return;
  }
  if (b.type === 'bind') {
    writeBoundAttr(b.node, b.attrName, safeEval(b.expr, { state, global: globals, self: b.node, app }, false), app);
    return;
  }
  if (b.type === 'text') {
    const out = b.template.replace(createRegex(app.config), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node, app }, false) ?? '');
    if (b.node.textContent !== out) b.node.textContent = out;
    return;
  }
  if (b.type === 'attr') {
    const out = b.template.replace(createRegex(app.config), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node, app }, false) ?? '');
    if (app.config.strict && URL_ATTRS.has(b.attrName.toLowerCase()) && isDangerousUrl(out)) {
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
const runBinding = (b, state, contextEl, app) => {
  // Audit fix #9: bindings whose nodes are gone are tagged dead by whoever
  // removed them, either b-html replacing the surrounding subtree or b-for
  // evicting a row from its pool. Skip them: they may still be sitting in
  // the dirty set from a mutation made earlier in the same frame, and
  // running one would write to a detached node and, worse, mint a fresh
  // effect for it against the wrong scope.
  if (b.dead) return;
  if (!b.effect) {
    b.effect = createEffect(
      () => executeBinding(b, state, contextEl, app),
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
/**
 * Whether a binding still has somewhere to write.
 *
 * `b-if` detaches its node rather than removing the bindings inside it, and
 * only `b-for` is a terminal directive, so the subtree under a false `b-if`
 * keeps its own bindings and used to evaluate them on every render. That made
 * the shape every framework teaches, `<div b-if="user">[[ user.name ]]</div>`,
 * throw while the condition was false. The work was wasted even when it did
 * not throw.
 *
 * A live binding owns at least one connected node: the node itself when the
 * branch is attached, or its anchor comment when a directive has swapped the
 * node out. A binding with neither is inside a detached branch, so it is
 * skipped and re-runs when its branch comes back.
 *
 * The `rootLive` guard keeps this from changing anything for a block mounted
 * on a detached tree, where nothing is connected and every binding must still
 * run exactly as before.
 */
const bindingIsLive = (b) => {
  if (b.node && b.node.isConnected) return true;
  return !!(b.anchor && b.anchor.isConnected);
};

/**
 * Wake the bindings inside a branch a directive has just re-attached.
 *
 * Skipping detached bindings means nothing marked them dirty while they were
 * away, and their dependencies have not necessarily changed since, so without
 * this a branch would come back carrying whatever text and attributes it was
 * cloned with. Marking them dirty here puts them in the next pass of the same
 * flush, which the batcher keeps draining until nothing new is queued.
 *
 * The directive's own binding is excluded: it has just run, and re-running it
 * would only re-evaluate the same condition.
 */
export const reviveBindings = (subtreeRoot, contextEl, skipBinding) => {
  const data = getPrivateData(contextEl);
  if (!data.bindings || !subtreeRoot) return;
  data.bindings.forEach(b => {
    if (b === skipBinding || b.dead) return;
    const node = b.node || b.anchor;
    if (!node) return;
    if (node === subtreeRoot || subtreeRoot.contains(node)) scheduleBinding(b, contextEl);
  });
};

export const runBindings = (bindings, state, contextEl, app, onError = null, guardDetached = false) => {
  let post = null;
  // Only the block's own pass opts in. b-for binds a pooled row before it is
  // inserted, so its rows are legitimately detached while their bindings run
  // and must never be skipped.
  const rootLive = guardDetached && !!(contextEl && contextEl.isConnected);
  const run = (b) => {
    if (rootLive && !bindingIsLive(b)) return;
    if (!onError) {
      runBinding(b, state, contextEl, app);
      return;
    }
    try {
      runBinding(b, state, contextEl, app);
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
  const app = appOf(el);
  const config = app.config;
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
    if (!data.bindings) data.bindings = scanForBindings(target, target === el, app);

    // Fine-grained re-render: a binding whose dependency changed put itself
    // in the dirty set, so run only those and let each effect re-collect its
    // deps. The full pass is the first render (which is what creates the
    // effects) and any render asked for without a dirty set.
    if (data.dirtyBindings && data.dirtyBindings.size > 0) {
      const dirty = data.dirtyBindings;
      data.dirtyBindings = null;
      runBindings(dirty, state, el, app, null, true);
    } else {
      runBindings(data.bindings, state, el, app, null, true);
    }
  } catch (err) {
    handleError(err, el, 'render');
  } finally {
    if (config.metrics && config.metrics.onRenderEnd) config.metrics.onRenderEnd(el);
    data.rendering = false;
  }
};
