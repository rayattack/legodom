import { resolve } from '../utils/helpers.js';

export const bText = {
  name: 'b-text',
  scan(node, { checkGlobal }) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-text')) {
      const path = node.getAttribute('b-text');
      checkGlobal(path);
      return { type: 'b-text', node, path };
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
