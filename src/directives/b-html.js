import { safeEval } from '../utils/safe-eval.js';
import { scanForAttribute } from '../utils/helpers.js';


/**
 * b-html — Sets innerHTML to the evaluated expression result.
 * 
 * WARNING: This intentionally injects raw, unsanitized HTML.
 * Only use with trusted content. Never bind to user-supplied input.
 */
export const bHtml = {
  name: 'b-html',
  scan: node => scanForAttribute('b-html', node),

  execute: ({ binding, state, global }) => {
    const { node, expr } = binding;
    node.innerHTML = safeEval(expr, { state, global, self: node }) || '';
  }
};
