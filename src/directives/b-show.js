import { safeEval } from '../utils/safe-eval.js';

export const bShow = {
  name: 'b-show',
  scan(node, { checkGlobal }) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-show')) {
      const expr = node.getAttribute('b-show');
      checkGlobal(expr);
      return { type: 'b-show', node, expr };
    }
  },

  execute({ binding, state, global }) {
    const { node, expr } = binding;
    node.style.display = safeEval(expr, { state, global, self: node }) ? '' : 'none';
  }
};
