/**
 * Shared test utilities for LegoDOM test suite.
 *
 * Centralizes async flush timing so CI environments can tune a single value
 * instead of hunting through dozens of hardcoded setTimeout calls.
 */

/**
 * Flush pending async operations (RAF callbacks, microtasks, debounced updates).
 * @param {number} [ms=100] - milliseconds to wait
 */
export const flush = (ms = 100) => new Promise(r => setTimeout(r, ms));
