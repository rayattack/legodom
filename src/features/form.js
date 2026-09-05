/**
 * Form participation for blocks declared with `b-form`.
 *
 * A form-associated custom element gets an `ElementInternals` object from
 * `attachInternals()`, which is how it submits a value, publishes validity and
 * hears about resets. Not every environment has it: JSDOM (and older Safari)
 * either lack the method or return an object without the form half of the API,
 * so a shim stands in with the same surface. Blocks and tests can therefore
 * exercise `$form` everywhere; only the browser actually submits.
 */

/**
 * A validity object is valid when none of its flags are set. `setValidity({})`
 * is the documented way to clear a custom error, so an empty flags object has
 * to come back valid.
 */
const isValid = (flags) => !Object.keys(flags || {}).some(key => flags[key]);

const createInternalsShim = (host) => {
  let validity = { valid: true };

  return {
    get form() { return host.closest ? host.closest('form') : null; },
    get name() { return host.getAttribute('name'); },
    get validity() { return validity; },
    /** Shim only: the last value handed to setFormValue, for tests and devtools. */
    value: null,
    setFormValue(next) { this.value = next; },
    setValidity(flags) { validity = Object.assign({}, flags, { valid: isValid(flags) }); },
    checkValidity() { return validity.valid; },
    reportValidity() { return validity.valid; }
  };
};

/**
 * Attach real ElementInternals when the platform provides a usable one, and
 * the shim otherwise. Called from the element constructor, which is the only
 * point `attachInternals` may be called.
 */
export const attachFormInternals = (host) => {
  if (typeof host.attachInternals !== 'function') return createInternalsShim(host);
  try {
    const native = host.attachInternals();
    if (native && typeof native.setFormValue === 'function') return native;
  } catch (e) {
    // Environments that define the method but refuse the call (no form
    // association support) fall through to the shim.
  }
  return createInternalsShim(host);
};

/**
 * The `$form` object placed on a form block's state. Every member delegates
 * straight to internals, so a block never needs to reach for the element.
 */
export const createFormApi = (internals) => ({
  setValue: (value, state) => internals.setFormValue(value, state),
  setValidity: (flags, message, anchor) => internals.setValidity(flags, message, anchor),
  reportValidity: () => internals.reportValidity(),
  checkValidity: () => internals.checkValidity(),
  get form() { return internals.form; },
  get name() { return internals.name; },
  get validity() { return internals.validity; }
});

/**
 * Publish `state.value` as the block's submitted value. Only the string form
 * is submitted, which is what a native input does with its own value.
 */
export const syncFormValue = (internals, value) => {
  internals.setFormValue(value === undefined || value === null ? '' : String(value));
};
