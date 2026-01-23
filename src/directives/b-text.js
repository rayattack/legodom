import { resolve } from '../utils/helpers.js';

export const bText = {
  name: 'b-text',
  execute({ binding, state }) {
    const { node, path } = binding;
    node.textContent = resolve(path, state);
  }
};
