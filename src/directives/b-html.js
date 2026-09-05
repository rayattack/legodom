import { safeEval } from '../utils/safe-eval.js';
import { scanForAttribute, config } from '../utils/helpers.js';
import { defaultSanitize } from '../utils/dom.js';
import { privateData } from '../core/registry.js';


/**
 * b-html — Sets innerHTML to the evaluated expression result.
 *
 * Default form (`b-html="expr"`) injects raw, unsanitized HTML — only use
 * with trusted content.
 *
 * `b-html.safe="expr"` runs the value through `Lego.config.sanitize` if
 * configured, falling back to a minimal built-in sanitizer that strips
 * <script>/<iframe>/<object>/<embed>/<link>/<meta>/<style>/<base> tags,
 * `on*` event-handler attributes, and `javascript:`/`vbscript:`/`data:text/html`
 * URLs. For production, set `Lego.config.sanitize = DOMPurify.sanitize`.
 */
export const bHtml = {
  name: 'b-html',
  scan: node => scanForAttribute('b-html', node),

  execute: ({ binding, state, global, helpers }) => {
    const { node, expr, modifiers } = binding;
    let value = safeEval(expr, { state, global, self: node }) ?? '';
    if (modifiers && modifiers.includes('safe')) {
      const sanitizer = typeof config.sanitize === 'function' ? config.sanitize : defaultSanitize;
      value = sanitizer(value);
    }
    if (node._bHtmlPrev !== value) {
      node._bHtmlPrev = value;
      // Audit fix #9: any bindings the initial scan picked up inside this
      // node (e.g. placeholder content with `[[...]]`) are about to point at
      // detached nodes. Tag them dead, stop their effects so a later state
      // change cannot wake them, and drop them from the parent block's
      // bindings array so subsequent renders don't write to dead nodes and
      // don't keep them alive.
      const contextEl = helpers && helpers.contextEl;
      if (contextEl) {
        const data = privateData.get(contextEl);
        if (data && data.bindings && data.bindings.length) {
          for (const b of data.bindings) {
            if (b !== binding && b.node && b.node !== node && node.contains(b.node)) {
              b.dead = true;
              b.node = null;
              if (b.effect) b.effect.stop();
            }
          }
          if (data.bindings.some(b => b.dead)) {
            data.bindings = data.bindings.filter(b => !b.dead);
          }
        }
      }
      node.innerHTML = value;
    }
  },

  destroy({ binding }) {
    const { node } = binding;
    if (node) {
      delete node._bHtmlPrev;
      node.innerHTML = '';
    }
  }
};
