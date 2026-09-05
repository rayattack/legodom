import { forPools, itemIdMap, privateData } from '../core/registry.js';
import { safeEval } from '../utils/safe-eval.js';
import { resolve } from '../utils/helpers.js';
import { syncModelValue, findSyncAttr } from '../utils/dom.js';

// Audit fix #39: monotonic counter for fallback item ids. Replaces
// Math.random() — same WeakMap-stable identity per item, but cheaper to
// generate and collision-free across the lifetime of the page.
let _itemIdCounter = 0;

const reportInnerError = (err) => console.error('[Lego] Error in b-for inner binding:', err);

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
    const { bind, scanForBindings, runBinding, runBindings } = helpers;
    if (!bind || !runBinding || !runBindings) {
      console.error('[Lego] b-for directive missing required helpers: bind, runBinding, runBindings');
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
            itemIdMap.set(item, ++_itemIdCounter);
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
        // Scan the child for inner directives (b-if, b-show, b-html, b-mount,
        // b-enter, b-leave, b-init, nested b-for). The main scanForBindings
        // skips nodes inside b-for via isInsideBoundary, so without this
        // pass those directives never bind. We scan once per child and
        // re-execute them with the loop's local scope on each render.
        if (scanForBindings) {
          // Pass contextEl so any `global` reads inside the loop subscribe
          // the parent block, not the detached child clone.
          child._loopBindings = scanForBindings(child, contextEl);
        }
        child._loopSyncInputs = [child, ...child.querySelectorAll('*')].filter(el => findSyncAttr(el));
      } else {
        // Keep index current so event handlers and b-sync resolve the right item
        child._loopCtx.index = i;
      }
      // Audit fix #19: reuse the localScope object per pool child instead
      // of allocating a fresh `Object.create(state)` on every render. The
      // scope's prototype is `state`, which is stable across renders for
      // the lifetime of this b-for binding (the pool itself is keyed on
      // the b-for anchor, which is destroyed alongside the block). 10k
      // items × per-render allocs were the dominant GC pressure here.
      let localScope = child._loopScope;
      if (!localScope) {
        child._loopScope = localScope = Object.create(state);
      }
      localScope[itemName] = item;
      localScope.$index = i;

      // Audit fix #15: iterate the pre-scanned bindings directly instead of
      // walking the whole subtree per render. _loopBindings is in document
      // order (directive on a parent comes before its descendants' text/attr
      // bindings), so b-if/b-html swap-in or wipe-out happens before the
      // inner text bindings run — same ordering the previous
      // directives-first / updateNodeBindings-second split provided. Text
      // and attr bindings use `b.template` captured at scan time, so they
      // also pick up correctly after a b-if swap restores a stashed subtree
      // (the binding still references the original — and now re-attached —
      // node).
      //
      // track=false: inner-loop bindings can't be re-run individually (their
      // localScope is ephemeral — a per-binding dirty path would have lost
      // the item reference). Reads during their execution are tracked under
      // the outer b-for binding, so item-property mutations trigger a full
      // loop re-iteration.
      //
      // runBindings applies the same two-phase split the main render pass
      // uses, so a `<select b-sync>` inside a row still runs after the
      // b-for that fills it with options. The error callback preserves the
      // previous per-binding isolation: one bad row binding does not stop
      // the rest of the row.
      if (child._loopBindings) {
        runBindings(child._loopBindings, localScope, contextEl, false, reportInnerError);
      }

      child._loopSyncInputs.forEach(input => {
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
