import { resolve } from '../utils/helpers.js';

export const bText = {
  name: 'b-text',
  scan(node) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-text')) {
      return { type: 'b-text', node, path: node.getAttribute('b-text') };
    }
  },

  execute({ binding, state, global }) {
    const { node, path } = binding;
    if (path.startsWith('global.')) {
      node.textContent = resolve(path.slice(7), global) ?? '';
    } else {
      node.textContent = resolve(path, state) ?? '';
    }
  }
};
