import { resolve } from '../utils/helpers.js';

export const bText = {
  name: 'b-text',
  scan(node) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-text')) {
      return { type: 'b-text', node, path: node.getAttribute('b-text') };
    }
  },

  execute({ binding, state }) {
    const { node, path } = binding;
    node.textContent = resolve(path, state);
  }
};
