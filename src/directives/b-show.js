import { safeEval } from '../utils/safe-eval.js';

export const bShow = {
  name: 'b-show',
  scan(node, { checkGlobal }) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('b-show')) {
      const expr = node.getAttribute('b-show');
      checkGlobal(expr);
      return { type: 'b-show', node, expr };
    }
  },

  execute({ binding, state, global }) {
    const { node, expr } = binding;
    // Audit fix #33: cache the author's inline `display` (e.g. "flex",
    // "grid") on first toggle, so flipping false→true restores it instead
    // of clearing inline display to '' and falling through to whatever a
    // stylesheet says. Stylesheet-only display values still resolve
    // naturally because cached '' lets the cascade apply.
    if (node._bShowOriginal === undefined) {
      node._bShowOriginal = node.style.display;
    }
    const visible = !!safeEval(expr, { state, global, self: node });
    node.style.display = visible ? node._bShowOriginal : 'none';
  }
};
