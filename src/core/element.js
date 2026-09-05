import { registry, snapState } from './registry.js';
import { snap, unsnap } from './lifecycle.js';

/**
 * Single source of truth for the custom element class backing every block.
 *
 * There used to be three copies of this class body (Lego.block, init()'s
 * inline-template pass, and the manifest's registerLazy), which meant any
 * lifecycle fix had to be made three times.
 *
 * The important behaviour here is `disconnectedCallback`. Moving a node in
 * the DOM (`insertBefore` during a b-for reorder, an `appendChild`
 * elsewhere) fires disconnect immediately followed by connect. Tearing the
 * block down synchronously on disconnect therefore destroyed and rebuilt
 * every moved block, losing its state and re-running `mounted()`. Deferring
 * the teardown by a microtask lets the re-insertion land first; if the
 * element really left the document, `isConnected` is still false when the
 * microtask runs and `unsnap()` proceeds as before.
 *
 * @param {string} tagName - the registered block name
 * @param {object} [options]
 * @param {(el: HTMLElement) => void} [options.lazyLoader] - invoked on connect
 *   when the block is not yet in the registry (manifest-backed lazy blocks).
 * @returns {typeof HTMLElement} a class ready for customElements.define
 */
export const createBlockElementClass = (tagName, options = {}) => {
  const { lazyLoader = null } = options;

  return class extends HTMLElement {
    connectedCallback() {
      // snap() is idempotent (it checks its own `snapped` flag), and the
      // element's private data survives a move because it is held in a
      // WeakMap keyed on the element itself. So a re-connect after a move
      // is effectively a no-op.
      if (registry[tagName]) {
        if (!snapState.locked) snap(this);
        return;
      }
      if (lazyLoader) lazyLoader(this);
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (!this.isConnected) unsnap(this);
      });
    }
  };
};
