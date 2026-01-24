import { safeEval } from '../utils/safe-eval.js';


export const bInit = {
  scan: node => {
    if (node.hasAttribute('b-init')) {
      return {
        type: 'b-init',
        node,
        expr: node.getAttribute('b-init')
      }
    }
  },

  execute: ({ binding, state }) => {
    if (!binding.initialized) {
      binding.initialized = true;
      safeEval(binding.expr, { state });
    }
  }
}
