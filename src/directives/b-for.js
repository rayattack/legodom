import { forPools, itemIdMap, privateData } from '../core/registry.js';
import { safeEval } from '../utils/safe-eval.js';
import { resolve } from '../utils/helpers.js';
import { syncModelValue, findSyncAttr } from '../utils/dom.js';

// Audit fix #39: monotonic counter for fallback item ids. Replaces
// Math.random() — same WeakMap-stable identity per item, but cheaper to
// generate and collision-free across the lifetime of the page.
let _itemIdCounter = 0;

const reportInnerError = (err) => console.error('[Lego] Error in b-for inner binding:', err);

/**
 * Detach a pooled row from the dependency graph. Its bindings own effects
 * that hold the row's scope and its item, so a row leaving the pool has to
 * stop them or a later mutation of the removed item would still schedule it.
 *
 * Stopping is not enough on its own. A row binding can already be sitting in
 * the host block's dirty set when, in the same frame, the loop runs first and
 * evicts its row: render() would then reach a binding with no effect, build a
 * fresh one against the block's state rather than the row's scope, and run it
 * on a detached node, where the item identifier no longer resolves. Marking
 * the binding dead makes runBinding skip it. The mark is final: a key that
 * comes back gets a fresh clone and a fresh scan, so these binding objects
 * are never reused.
 */
const stopRow = (node) => {
  if (!node._loopBindings) return;
  node._loopBindings.forEach(b => {
    b.dead = true;
    if (!b.effect) return;
    b.effect.stop();
    b.effect = null;
  });
};

export const bFor = {
  name: 'b-for',
  scan(node, { pendingOperations }) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const match = node.getAttribute('b-for')?.match(/^\s*(\w+)\s+in\s+([\s\S]+?)\s*$/);
    if (match) {
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

  execute({ binding, state, global, app, helpers }) {
    const { bind, scanForBindings, runBinding, runBindings } = helpers;
    if (!bind || !runBinding || !runBindings) {
      console.error('[Lego] b-for directive missing required helpers: bind, runBinding, runBindings');
      return;
    }

    const { anchor, listName, itemName, keyPath, template } = binding;

    // We will expect 'contextEl' in the arguments.
    const { contextEl } = helpers;

    const list = safeEval(listName, { state, global, self: contextEl, app }) || [];
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
      // Pool lookups are Map identity comparisons and the server writes
      // data-b-key as text, so both sides settle on the string form. Without
      // this a numeric `b-key="id"` would never find the row hydration
      // adopted under "1".
      key = String(key);
      currentKeys.add(key);
      let child = pool.get(key);
      const isNewRow = !child;
      if (!child) {
        child = template.cloneNode(true);
        child.removeAttribute('b-for');
        child.removeAttribute('b-key');
        pool.set(key, child);
        child._loopCtx = { name: itemName, listName, index: i };
        bind(child, contextEl, child._loopCtx);
        // Scan the child for inner directives (b-if, b-show, b-html, b-mount,
        // b-enter, b-leave, b-init, nested b-for). The block's own scan stops
        // at the b-for boundary, so without this pass those directives never
        // bind. We scan once per row; each binding then owns an effect bound
        // to this row's scope.
        if (scanForBindings) {
          child._loopBindings = scanForBindings(child, false, app);
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
      // A row only needs re-running when the loop itself moved it: a new
      // row, a different item under the same key, or a new index. A change
      // *inside* an item reaches the row's own bindings directly, through
      // the effects they own, without the loop hearing about it at all.
      const moved = isNewRow || child._loopItem !== item || child._loopIndex !== i;
      localScope[itemName] = item;
      localScope.$index = i;
      child._loopItem = item;
      child._loopIndex = i;

      // Audit fix #15: iterate the pre-scanned bindings directly instead of
      // walking the whole subtree per render. _loopBindings is in document
      // order (directive on a parent comes before its descendants' text/attr
      // bindings), so b-if/b-html swap-in or wipe-out happens before the
      // inner text bindings run, the same ordering the previous
      // directives-first / updateNodeBindings-second split provided. Text
      // and attr bindings use `b.template` captured at scan time, so they
      // also pick up correctly after a b-if swap restores a stashed subtree
      // (the binding still references the original, now re-attached, node).
      //
      // Each row binding gets its own effect on this first run, closed over
      // this row's persistent `_loopScope`. From then on the row reacts by
      // itself: mutating `items[0].title` re-runs one text binding in row 0
      // and nothing else.
      //
      // runBindings applies the same two-phase split the main render pass
      // uses, so a `<select b-sync>` inside a row still runs after the
      // b-for that fills it with options. The error callback preserves the
      // previous per-binding isolation: one bad row binding does not stop
      // the rest of the row.
      if (moved && child._loopBindings) {
        runBindings(child._loopBindings, localScope, contextEl, app, reportInnerError);
      }

      // Kept outside the row effects on purpose: these reads would otherwise
      // make the loop itself depend on item fields, which is exactly the
      // coupling this phase removes. b-sync's own binding keeps the input in
      // step with later edits to the item.
      if (moved) {
        child._loopSyncInputs.forEach(input => {
          const attr = findSyncAttr(input);
          const path = attr.value;
          if (path.startsWith(`${itemName}.`)) {
            syncModelValue(input, resolve(path.split('.').slice(1).join('.'), list[i]));
          }
        });
      }
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
      if (currentKeys.has(key)) continue;
      stopRow(node);
      node.remove();
      pool.delete(key);
    }
  },

  destroy({ binding }) {
    const { anchor } = binding;
    if (anchor && forPools.has(anchor)) {
      const pool = forPools.get(anchor);
      pool.forEach(node => {
        stopRow(node);
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
