import { forPools, itemIdMap, privateData } from '../core/registry.js';
import { safeEval } from '../utils/safe-eval.js';
import { resolve } from '../utils/helpers.js';
import { syncModelValue, findSyncAttr } from '../utils/dom.js';

export const bFor = {
  name: 'b-for',
  scan(node, { checkGlobal, pendingOperations }) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const match = node.getAttribute('b-for')?.match(/^\s*(\w+)\s+in\s+([\s\S]+?)\s*$/);
    if (match) {
      checkGlobal(match[2]);
      const anchor = document.createComment(`b-for: ${match[1]} in ${match[2].trim()}`);

      // Defer DOM modification to avoid breaking TreeWalker
      pendingOperations.push(() => {
        if (node.parentNode) {
          node.parentNode.insertBefore(anchor, node);
          node.remove();
        }
      });

      return {
        type: 'b-for',
        anchor,
        itemName: match[1],
        listName: match[2].trim(),
        keyPath: node.getAttribute('b-key') || null,
        template: node.cloneNode(true),
        terminal: true
      };
    }
  },

  execute({ binding, state, global, helpers }) {
    const { bind, updateNodeBindings } = helpers;
    if (!bind || !updateNodeBindings) {
      console.error('[Lego] b-for directive missing required helpers: bind, updateNodeBindings');
      return;
    }

    const { anchor, listName, itemName, keyPath, template } = binding;

    // We will expect 'contextEl' in the arguments.
    const { contextEl } = helpers;

    const list = safeEval(listName, { state, global, self: contextEl }) || [];
    if (!forPools.has(anchor)) forPools.set(anchor, new Map());
    const pool = forPools.get(anchor);
    const currentKeys = new Set();
    const renderedChildren = [];  // Track order of rendered children

    list.forEach((item, i) => {
      // Smart key generation: b-key > common id fields > __id fallback
      let key;
      if (keyPath) {
        // User specified b-key="propertyName"
        key = resolve(keyPath, item);
        if (key == null || key === '') {
          console.warn(`[Lego] b-key="${keyPath}" could not resolve a value for item at index ${i}. Falling back to index-based key.`);
          key = `__bfor_${i}`;
        }
      } else if (item && typeof item === 'object') {
        // Auto-detect common ID fields
        key = item.id || item._id || item.uuid || item.key;
        // Fallback to WeakMap-based ID (no mutation, no reactivity trigger)
        if (key === undefined) {
          if (!itemIdMap.has(item)) {
            itemIdMap.set(item, Math.random());
          }
          key = itemIdMap.get(item);
        }
      } else {
        // Primitive values: use index + value
        key = `${i}-${item}`;
      }
      currentKeys.add(key);
      let child = pool.get(key);
      if (!child) {
        child = template.cloneNode(true);
        child.removeAttribute('b-for');
        child.removeAttribute('b-key');
        pool.set(key, child);
        child._loopCtx = { name: itemName, listName, index: i };
        bind(child, contextEl, child._loopCtx);
      } else {
        // Keep index current so event handlers and b-sync resolve the right item
        child._loopCtx.index = i;
      }
      const localScope = Object.assign(Object.create(state), { [itemName]: item, $index: i });
      updateNodeBindings(child, localScope);

      const syncInputs = [child, ...child.querySelectorAll('*')].filter(el => findSyncAttr(el));
      syncInputs.forEach(input => {
        const attr = findSyncAttr(input);
        const path = attr.value;
        if (path.startsWith(`${itemName}.`)) {
          syncModelValue(input, resolve(path.split('.').slice(1).join('.'), list[i]));
        }
      });
      renderedChildren.push(child);
    });

    // Insert/reorder children as siblings after the anchor
    let insertPoint = anchor.nextSibling;
    renderedChildren.forEach(child => {
      if (child !== insertPoint) {
        anchor.parentNode.insertBefore(child, insertPoint);
      } else {
        insertPoint = insertPoint.nextSibling;
      }
    });

    // Remove stale nodes
    for (const [key, node] of pool.entries()) {
      if (!currentKeys.has(key)) { node.remove(); pool.delete(key); }
    }
  },

  destroy({ binding }) {
    const { anchor } = binding;
    if (anchor && forPools.has(anchor)) {
      const pool = forPools.get(anchor);
      pool.forEach(node => {
        // Clean up listeners and directive bindings on each pool child and its descendants
        const nodes = [node, ...node.querySelectorAll('*')];
        nodes.forEach(n => {
          const data = privateData.get(n);
          if (!data) return;
          if (data.listeners) {
            data.listeners.forEach(({ eventName, handler }) => {
              n.removeEventListener(eventName, handler);
            });
            data.listeners = null;
          }
          if (data.bindings) {
            data.bindings.forEach(b => {
              if (b.observer) {
                b.observer.disconnect();
                b.observer = null;
              }
            });
            data.bindings = null;
          }
        });
        node.remove();
      });
      pool.clear();
      forPools.delete(anchor);
    }
    if (anchor && anchor.parentNode) {
      anchor.remove();
    }
  }
};
