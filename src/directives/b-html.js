import { safeEval } from '../utils/safe-eval.js';

export const bHtml = {
  name: 'b-html',
  execute({ binding, state, global }) {
    const { node, expr } = binding;
    node.innerHTML = safeEval(expr, { state, global, self: node }) || '';
  }
};
