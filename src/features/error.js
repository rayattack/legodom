import { registry } from '../core/registry.js';
import { config } from '../utils/helpers.js';

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
    const templateNode = registry[tagName];
    if (templateNode) {
      const templateError = templateNode.getAttribute('b-error');
      if (templateError) {
        if (templateError.toLowerCase() !== el.tagName.toLowerCase()) {
          return { errorTag: templateError, targetElement: current };
        }
      }
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

export const handleError = (err, contextEl, contextType) => {
  const boundary = findErrorBoundary(contextEl);
  if (boundary) {
    renderErrorBlock(boundary.errorTag, boundary.targetElement, err);
  } else {
    config.onError(err, contextType, contextEl);
  }
};
