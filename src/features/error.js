import { getDefinition } from '../core/registry.js';
import { appOf } from '../core/globals.js';

/**
 * Find the nearest error boundary for a crashed element
 */
export const findErrorBoundary = (el) => {
  let current = el;
  while (current) {
    // 1. Check instance-level attribute (override)
    const instanceError = current.getAttribute && current.getAttribute('b-error');
    if (instanceError) {
      if (instanceError.toLowerCase() !== el.tagName.toLowerCase()) {
        return { errorTag: instanceError, targetElement: current };
      }
    }

    // 2. Check template-level attribute (default)
    const tagName = current.tagName ? current.tagName.toLowerCase() : '';
    const definition = getDefinition(tagName);
    const templateError = definition && definition.error;
    if (templateError && templateError.toLowerCase() !== el.tagName.toLowerCase()) {
      return { errorTag: templateError, targetElement: current };
    }

    // 3. Bubble up to parent
    current = current.parentElement || (current.getRootNode && current.getRootNode().host);
  }
  return null;
};

// Injection point to avoid circular dependencies
let _snap = null;
let _render = null;

export const setErrorHandlers = (snapFn, renderFn) => {
  _snap = snapFn;
  _render = renderFn;
};

/**
 * Render an error block in place of a crashed component
 */
export const renderErrorBlock = (errorTag, crashedEl, err) => {
  if (!_snap || !_render) {
    console.error('[Lego] Error boundary dependencies not loaded', err);
    return;
  }

  try {
    // Clear the crashed element's content
    if (crashedEl.shadowRoot) {
      crashedEl.shadowRoot.innerHTML = '';
    } else {
      crashedEl.innerHTML = '';
    }

    // Create the error block
    const errorBlock = document.createElement(errorTag);

    // Pre-seed the state to avoid double-render and ensure $error exists on first render
    errorBlock.$initialState = {
      $error: {
        message: err.message,
        stack: err.stack,
        component: crashedEl.tagName.toLowerCase()
      }
    };

    // Append to crashed element
    const target = crashedEl.shadowRoot || crashedEl;
    target.appendChild(errorBlock);

    // Snap the error block (will render immediately with $error available)
    _snap(errorBlock);
  } catch (renderErr) {
    // If error rendering fails, fall back to console
    console.error('[Lego] Error boundary failed to render:', renderErr);
    console.error('[Lego] Original error:', err);
  }
};

// Per-boundary recursion counter. Keyed on the boundary's targetElement so
// concurrent recoveries in unrelated trees don't share a budget — a sibling
// tree erroring synchronously inside another tree's recovery (e.g. an error
// block's mounted() hook dispatching an event) gets its own depth, instead
// of inheriting the elevated count from the in-flight chain.
const _errorDepth = new WeakMap();
const MAX_ERROR_DEPTH = 3;

/**
 * Call one block's errorCaptured hook.
 *
 * A hook that throws is reported through config.onError and nothing else: it
 * must not re-enter handleError, or a broken handler would recurse through
 * the very machinery it broke.
 *
 * @returns {boolean} true when the hook claimed the error
 */
const callCaptured = (hook, state, err, type, source, el) => {
  try {
    return hook.call(state, err, { type, source }) === false;
  } catch (inner) {
    appOf(el).config.onError(inner, 'errorCaptured', el);
    return false;
  }
};

/**
 * Offer an error to every block on the way out of the tree before the
 * boundary machinery sees it. Returning `false` from `errorCaptured` claims
 * the error: no boundary is rendered and `config.onError` is not called.
 * Returning anything else (including nothing) lets it keep travelling, so a
 * hook can log or report without changing what happens next.
 *
 * The walk starts at the erroring element itself, so a block can also handle
 * failures raised by its own render or hooks.
 */
const runErrorCaptured = (err, contextEl, contextType) => {
  let current = contextEl;
  while (current) {
    const state = current._studs;
    const hook = state && state.errorCaptured;
    if (typeof hook === 'function' && callCaptured(hook, state, err, contextType, contextEl, current)) {
      return true;
    }
    current = current.parentElement || (current.getRootNode && current.getRootNode().host);
  }
  return false;
};

export const handleError = (err, contextEl, contextType) => {
  if (runErrorCaptured(err, contextEl, contextType)) return;
  // The failing element's own app hears about it: two apps on a page each
  // keep their own onError.
  const config = appOf(contextEl).config;
  const boundary = findErrorBoundary(contextEl);
  if (!boundary) {
    config.onError(err, contextType, contextEl);
    return;
  }
  const key = boundary.targetElement;
  const depth = _errorDepth.get(key) || 0;
  if (depth >= MAX_ERROR_DEPTH) {
    console.error('[Lego] Error boundary recursion limit reached:', err);
    config.onError(err, contextType, contextEl);
    return;
  }
  _errorDepth.set(key, depth + 1);
  try {
    renderErrorBlock(boundary.errorTag, key, err);
  } finally {
    const next = (_errorDepth.get(key) || 0) - 1;
    if (next <= 0) _errorDepth.delete(key);
    else _errorDepth.set(key, next);
  }
};

/**
 * Route an async rejection into the same place a synchronous throw goes.
 *
 * Lifecycle hooks, `@event` handlers and directive expressions are all
 * invoked inside a try/catch. That catch never sees the failure of an
 * `async` function: the call returns a rejected promise instead of
 * throwing, so neither the error boundary nor `config.onError` fires and
 * the page dies with an unhandled rejection instead. Pass every such call
 * result through here.
 *
 * Non-thenable results (the overwhelmingly common case) pass straight
 * through, so this is a single typeof check on the hot path.
 *
 * @param {any} result - return value of the user-supplied function
 * @param {HTMLElement} el - element used to locate the error boundary
 * @param {string} contextType - label forwarded to config.onError
 * @returns {any} `result`, unchanged
 */
export const guardResult = (result, el, contextType) => {
  if (result && typeof result.then === 'function') {
    result.then(undefined, (err) => handleError(err, el, contextType));
  }
  return result;
};
