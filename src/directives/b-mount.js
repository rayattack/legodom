import { safeEval } from '../utils/safe-eval.js';
import { scanForAttribute } from '../utils/helpers.js';
import { mount } from '../features/mount.js';

export const bMount = {
  name: 'b-mount',

  scan: node => scanForAttribute('b-mount', node, () => ({ _lastTag: null })),

  execute({ binding, state, global, app }) {
    const { node, expr } = binding;
    const result = safeEval(expr, { state, global, self: node, app }, false);
    const tagName = result ? String(result).toLowerCase() : null;

    if (tagName === binding._lastTag) return;
    binding._lastTag = tagName;

    mount(tagName, node);
  },

  destroy({ binding }) {
    if (binding.node) {
      mount(null, binding.node);
    }
    binding._lastTag = null;
  }
};
