import { safeEval } from '../utils/safe-eval.js';
import { guardResult } from '../features/error.js';


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

  execute: ({ binding, state, global, app, helpers }) => {
    if (binding.initialized) return;
    binding.initialized = true;
    // A synchronous throw propagates to render()'s handler; an async
    // rejection would otherwise escape entirely, so route it explicitly.
    const owner = (helpers && helpers.contextEl) || binding.node;
    guardResult(
      safeEval(binding.expr, { state, global, self: binding.node, app }),
      owner,
      'b-init'
    );
  }
}
