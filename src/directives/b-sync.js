import { resolve } from '../utils/helpers.js';
import { syncModelValue, findSyncAttr } from '../utils/dom.js';

export const bSync = {
  name: 'b-sync',
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
