import { forPools, itemIdMap } from '../core/registry.js';
import { safeEval } from '../utils/safe-eval.js';
import { resolve } from '../utils/helpers.js';
import { syncModelValue } from '../utils/dom.js';

export const bFor = {
  name: 'b-for',
  execute({ binding, state, global, helpers }) {
    const { bind, updateNodeBindings } = helpers;
    if (!bind || !updateNodeBindings) {
      console.error('[Lego] b-for directive missing required helpers: bind, updateNodeBindings');
      return;
    }

    const { anchor, listName, itemName, keyPath, template } = binding;
    // self reference - usually execution context element. Binding has node or anchor?
    // In b-for, binding.anchor is the reference point. The original node is binding.template.
    // The list is evaluated in the context of the container (parent of anchor).
    // The renderer passes 'el' (the container) as 'self' for list evaluation usually?
    // In renderer.js: safeEval(b.listName, { state, global, self: el })
    // We need 'el' (the host component or container).
    // The binding object in renderer.js doesn't explicitly store 'el' (the container), but the execute context should provide it.
    // We'll assume the context passes 'contextEl' or similar.

    // Looking at renderer.js: list = safeEval(b.listName, { state, global, self: el })
    // 'el' is the element being rendered (the container).
    // binding.anchor.parentNode should be 'el' or close to it?
    // No, 'el' is the blockRoot usually? No, render(el) renders the block.
    // The template might be inside the shadowRoot of 'el'.
    // So 'self' for safeEval should be 'el'.

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
        if (key === undefined) {
          console.warn(`[Lego] b-key="${keyPath}" resolved to undefined for item at index ${i}. Check for typos.`);
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
        bind(child, contextEl, { name: itemName, listName, index: i });
      }
      const localScope = Object.assign(Object.create(state), { [itemName]: item, $index: i });
      updateNodeBindings(child, localScope);

      child.querySelectorAll('[b-sync]').forEach(input => {
        const path = input.getAttribute('b-sync');
        if (path.startsWith(itemName + '.')) {
          const mainList = safeEval(listName, { state, global, self: contextEl });
          syncModelValue(input, resolve(path.split('.').slice(1).join('.'), mainList[i]));
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
  }
};
