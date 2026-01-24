import { safeEval } from '../utils/safe-eval.js';
import { scanForAttribute } from '../utils/helpers.js';

export const bIf = {
  name: 'b-if',
  scan: (node, { checkGlobal, getPrivateData }) => scanForAttribute('b-if', node, (attr, node) => {
    checkGlobal(attr.value);
    const anchor = document.createComment(`b-if: ${attr.value}`);
    const data = getPrivateData(node);
    data.anchor = anchor;
    return { anchor };
  }),

  oscan: (node, { checkGlobal, getPrivateData }) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-if')) {
      const expr = node.getAttribute('b-if');
      checkGlobal(expr);
      const anchor = document.createComment(`b-if: ${expr}`);
      const data = getPrivateData(node);
      data.anchor = anchor;
      return { type: 'b-if', node, anchor, expr };
    }
  },

  execute({ binding, state, global }) {
    const { node, anchor, expr } = binding;
    const condition = !!safeEval(expr, { state, global, self: node });
    const isAttached = !!node.parentNode;
    if (condition && !isAttached) {
      if (anchor.parentNode) anchor.parentNode.replaceChild(node, anchor);
    } else if (!condition && isAttached) {
      node.parentNode.replaceChild(anchor, node);
    }
  }
};
