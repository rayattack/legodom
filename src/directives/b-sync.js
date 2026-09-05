import { resolve } from '../utils/helpers.js';
import { syncModelValue, findSyncAttr } from '../utils/dom.js';

export const bSync = {
  name: 'b-sync',
  // Runs after every other binding on the block. A `<select b-sync="pick">`
  // whose <option> list is produced by a b-for sits *before* that b-for in
  // document order, so in a single ordered pass the select's value would be
  // assigned while it still had no matching option and the assignment would
  // be silently discarded. The 'post' phase defers b-sync until the DOM its
  // value depends on exists.
  phase: 'post',
  scan(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const attr = findSyncAttr(node);
    if (!attr) return;
    const modifiers = attr.name.split('.').slice(1);
    return { type: 'b-sync', node, expr: attr.value, modifiers };
  },

  execute({ binding, state, global }) {
    const { node, expr } = binding;
    if (expr.startsWith('global.')) {
      syncModelValue(node, resolve(expr.slice(7), global) ?? '');
    } else {
      syncModelValue(node, resolve(expr, state) ?? '');
    }
  },

  destroy({ binding }) {
    const { node } = binding;
    if (node && node._bSyncHandler) {
      node.removeEventListener('input', node._bSyncHandler);
      node.removeEventListener('change', node._bSyncHandler);
      delete node._bSyncHandler;
    }
  }
};
