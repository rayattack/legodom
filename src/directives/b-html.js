import { safeEval } from '../utils/safe-eval.js';
import { scanForAttribute } from '../utils/helpers.js';

export const bHtml = {
  scan: node => scanForAttribute('b-html', node),

  execute: ({ binding, state, global }) => {
    const { node, expr } = binding;
    node.innerHTML = safeEval(expr, { state, global, self: node }) || '';
  }
};
