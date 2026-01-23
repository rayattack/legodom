import { safeEval } from '../utils/safe-eval.js';

export const bShow = {
  name: 'b-show',
  execute({ binding, state, global }) {
    const { node, expr } = binding;
    node.style.display = safeEval(expr, { state, global, self: node }) ? '' : 'none';
  }
};
