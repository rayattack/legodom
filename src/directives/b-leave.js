import { safeEval } from "../utils/safe-eval.js";
import { scanForAttribute } from "../utils/helpers.js";
import { handleError, guardResult } from "../features/error.js";


export const bLeave = {
  name: 'b-leave',
  scan: node => scanForAttribute('b-leave', node),

  execute: ({ binding, state, global, app, helpers }) => {
    if (binding.observer || binding.done) return;
    // Captured now: the observer callback fires long after execute returns.
    const owner = (helpers && helpers.contextEl) || binding.node;

    const observer = new IntersectionObserver((entries, io) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        binding.activated = true;
        return;
      }
      if (!binding.activated) return;
      try {
        // guardResult covers `b-leave="save()"` returning a promise.
        guardResult(
          safeEval(binding.expr, { state, global, self: binding.node, app }),
          owner,
          'b-leave'
        );
      } catch (err) {
        handleError(err, owner, 'b-leave');
      }
      if (binding.modifiers.includes('once')) {
        io.disconnect();
        binding.observer = null;
        binding.done = true;
      }
    })

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
