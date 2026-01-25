import { resolve } from '../utils/helpers.js';
import { syncModelValue } from '../utils/dom.js';

export const bSync = {
  name: 'b-sync',
  scan(node) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-sync')) {
      return { type: 'b-sync', node };
    }
  },

  execute({ binding, state }) {
    const { node } = binding;
    syncModelValue(node, resolve(node.getAttribute('b-sync'), state));
  }
};
