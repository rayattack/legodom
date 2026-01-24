import { safeEval } from '../utils/safe-eval.js';

export const bHtml = {
  name: 'b-html',
  scan(node, { checkGlobal }) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-html')) {
      const expr = node.getAttribute('b-html');
      checkGlobal(expr);
      return { type: 'b-html', node, expr };
    }
  },

  execute({ binding, state, global }) {
    const { node, expr } = binding;
    node.innerHTML = safeEval(expr, { state, global, self: node }) || '';
  }
};
