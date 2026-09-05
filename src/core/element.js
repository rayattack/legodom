import { registry, snapState, getPrivateData } from './registry.js';
import { snap, unsnap } from './lifecycle.js';
import { bProps } from '../directives/b-props.js';
import { attachFormInternals } from '../features/form.js';

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
 * `formAssociated` and `observedAttributes` are read by the platform once, at
 * `customElements.define` time, so both can only describe what the registry
 * already knows. A block whose definition arrives later (a lazy manifest
 * entry) therefore cannot be form associated, and gets attribute reflection
 * from a per-instance MutationObserver that `snap()` installs instead.
 *
 * @param {string} tagName - the registered block name
 * @param {object} [options]
 * @param {(el: HTMLElement) => void} [options.lazyLoader] - invoked on connect
 *   when the block is not yet in the registry (manifest-backed lazy blocks).
 * @returns {typeof HTMLElement} a class ready for customElements.define
 */
export const createBlockElementClass = (tagName, options = {}) => {
  const { lazyLoader = null } = options;
  const definition = registry[tagName];
  const isFormBlock = !!definition && definition.hasAttribute('b-form');
  const propAttrs = bProps.attrs(tagName);

  return class extends HTMLElement {
    static formAssociated = isFormBlock;
    static get observedAttributes() { return propAttrs; }

    constructor() {
      super();
      if (isFormBlock) this._internals = attachFormInternals(this);
    }

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

    /**
     * Fires before snap() during parsing and upgrade, when there is no state
     * to write to yet. snap() reflects the attributes that were present at
     * mount, so nothing is lost by ignoring those early calls.
     */
    attributeChangedCallback(name) {
      bProps.applyAttribute(this, tagName, name);
    }

    formResetCallback() {
      const data = getPrivateData(this);
      if (!this._studs || !('initialValue' in data)) return;
      this._studs.value = data.initialValue;
    }

    formDisabledCallback(disabled) {
      if (this._studs) this._studs.$disabled = disabled;
    }
  };
};
