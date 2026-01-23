import { resolve } from '../utils/helpers.js';
import { syncModelValue } from '../utils/dom.js';

export const bSync = {
  name: 'b-sync',
  execute({ binding, state }) {
    const { node } = binding;
    syncModelValue(node, resolve(node.getAttribute('b-sync'), state));
  }
};
