import { safeEval } from '../utils/safe-eval.js';
import { scanForAttribute } from '../utils/helpers.js';

export const bIf = {
  name: 'b-if',
  scan: (node, { getPrivateData }) => scanForAttribute('b-if', node, (attr, node) => {
    const anchor = document.createComment(`b-if: ${attr.value}`);
    const data = getPrivateData(node);
    data.anchor = anchor;
    return { anchor };
  }),

  execute({ binding, state, global, app, helpers }) {
    const { node, anchor, expr } = binding;
    const condition = !!safeEval(expr, { state, global, self: node, app });
    const isAttached = !!node.parentNode;
    if (condition && !isAttached) {
      if (!anchor.parentNode) return;
      anchor.parentNode.replaceChild(node, anchor);
      // The bindings in this branch were skipped while it was detached, so
      // they hold whatever the template was cloned with. Wake them now.
      if (helpers && helpers.reviveBindings) {
        helpers.reviveBindings(node, helpers.contextEl, binding);
      }
    } else if (!condition && isAttached) {
      node.parentNode.replaceChild(anchor, node);
    }
  },

  destroy({ binding }) {
    if (binding.anchor && binding.anchor.parentNode) {
      binding.anchor.remove();
    }
  }
};
