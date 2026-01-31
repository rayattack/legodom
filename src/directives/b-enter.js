import { safeEval } from "../utils/safe-eval.js";
import { scanForAttribute } from "../utils/helpers.js";

export const bEnter = {
  name: 'b-enter',
  scan: node => scanForAttribute('b-enter', node, (attr, node) => {
    const modifiers = attr.name.split('.').slice(1);
    return { modifiers }
  }),

  execute: ({ binding, state }) => {
    if (binding.observer || binding.done) return;

    const observer = new IntersectionObserver((entries, io) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        safeEval(binding.expr, { state, self: binding.node });
        if (binding.modifiers.includes('once')) {
          io.disconnect();
          binding.observer = null;
          binding.done = true;
        }
      }
    });

    observer.observe(binding.node);
    binding.observer = observer;  // store observer on the binding obj so we can clean it later
  },

  destroy: ({ binding }) => {
    if (binding.observer) {
      binding.observer.disconnect();
      binding.observer = null;
    }
  }
}
