import { safeEval } from "../utils/safe-eval.js";
import { scanForAttribute } from "../utils/helpers.js";

export const bEnter = {
  scan: node => scanForAttribute('b-enter', node),

  execute: ({ binding, state }) => {
    // idempotency check, let's not create an observer if we have on already
    if (binding.observer) return;

    const observer = new IntersectionObserver(entries => {
      const entry = entries[0];
      if (entry.isIntersecting) safeEval(binding.expr, { state });
      // optional run once code
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
