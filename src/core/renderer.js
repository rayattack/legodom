import { registry, forPools, itemIdMap, getPrivateData, globalSubscribers } from './registry.js';
import { globals } from './globals.js';
import { config, resolve, createRegex, getDelimiters } from '../utils/helpers.js';
import { safeEval } from '../utils/safe-eval.js';
import { findErrorBoundary, renderErrorBlock, handleError } from '../features/error.js';
import { directives } from '../directives/index.js';

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

          child.addEventListener(eventName, (event) => {
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
          });
        }
      }

      if (child.hasAttribute('b-sync')) {
        const prop = child.getAttribute('b-sync');
        const updateState = () => {
          try {
            let target, last;
            if (loopCtx && prop.startsWith(`${loopCtx.name}.`)) {
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
            const newVal = child.type === 'checkbox' ? child.checked : child.value;
            if (target && target[last] !== newVal) target[last] = newVal;
          } catch (err) {
            config.onError(err, 'sync-update', child);
          }
        };
        child.addEventListener('input', updateState);
        child.addEventListener('change', updateState);
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
  const bindings = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node;
  const pendingOperations = []; // Queue DOM modifications to avoid breaking TreeWalker

  while (node = walker.nextNode()) {
    const current = node; // Capture for closure
    const isInsideBoundary = (n) => {
      let curr = n.parentNode;
      while (curr && curr !== container) {
        if (curr.hasAttribute && curr.hasAttribute('b-for')) return true;
        curr = curr.parentNode;
      }
      return false;
    };
    if (isInsideBoundary(node)) continue;

    // TODO: there is a better way to do this, not just sure yet - will research
    const checkGlobal = (str) => {
      if (/\bglobal\b/.test(str)) {
        const target = container.host || container;
        globalSubscribers.add(target);
      }
    };

    if (node.nodeType === Node.ELEMENT_NODE) {
      // Dynamic Directive Scanning
      for (const [name, implementation] of Object.entries(directives)) {
        if (implementation.scan) {
          const result = implementation.scan(node, {
            checkGlobal,
            getPrivateData,
            pendingOperations,
            current
          });
          if (result) bindings.push(result);
        }
      }

      const [start] = getDelimiters();
      [...node.attributes].forEach(attr => {
        if (attr.value.includes(start)) {
          checkGlobal(attr.value);
          bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
        }
      });
    } else if (node.nodeType === Node.TEXT_NODE) {
      const [start] = getDelimiters();
      if (node.textContent.includes(start)) {
        checkGlobal(node.textContent);
        bindings.push({ type: 'text', node, template: node.textContent });
      }
    }
  }

  // Execute deferred DOM modifications
  pendingOperations.forEach(op => op());

  return bindings;
};

const updateNodeBindings = (root, scope) => {
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node._tpl === undefined) node._tpl = node.textContent;
      const out = node._tpl.replace(createRegex(), (_, k) => safeEval(k.trim(), { state: scope, global: globals, self: node }, false) ?? '');
      if (node.textContent !== out) node.textContent = out;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const [start] = getDelimiters();
      [...node.attributes].forEach(attr => {
        if (attr._tpl === undefined) attr._tpl = attr.value;
        if (attr._tpl.includes(start)) {
          const out = attr._tpl.replace(createRegex(), (_, k) => safeEval(k.trim(), { state: scope, global: globals, self: node }, false) ?? '');
          if (attr.value !== out) {
            attr.value = out;
            if (attr.name === 'class') node.className = out;
          }
        }
      });
    }
  };
  processNode(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while (n = walker.nextNode()) processNode(n);
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

    data.bindings.forEach(b => {
      // Directives execution (b-if, b-for, b-show, etc.)
      const directive = directives[b.type];
      if (directive) {
        directive.execute({
          binding: b,
          state,
          global: globals,
          helpers: {
            bind,
            updateNodeBindings,
            contextEl: el
          }
        });
        return;
      }

      // Legacy/Internal binding types
      if (b.type === 'text') {
        const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
        if (b.node.textContent !== out) b.node.textContent = out;
      }
      if (b.type === 'attr') {
        const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: globals, self: b.node }, false) ?? '');
        if (b.node.getAttribute(b.attrName) !== out) {
          b.node.setAttribute(b.attrName, out);
          if (b.attrName === 'class') b.node.className = out;
        }
      }
    });

    // Global Broadcast: Only notify blocks that depend on globals
    if (state === globals) {
      globalSubscribers.forEach(block => render(block));
    }
  } catch (err) {
    handleError(err, el, 'render');
  } finally {
    if (config.metrics && config.metrics.onRenderEnd) config.metrics.onRenderEnd(el);
    data.rendering = false;
  }
};
