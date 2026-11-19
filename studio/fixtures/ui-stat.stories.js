/**
 * Stories that need more than an attribute can carry.
 *
 * A `<story>` section is the right place for a variant that fits on one line.
 * Anything computed, imported or shared between variants belongs here, where
 * it is ordinary JavaScript.
 */
const week = (start) => Array.from({ length: 7 }, (_, day) => start + day * 3);

export default {
  Revenue: {
    args: { label: 'Revenue', value: 128400, unit: ' USD', delta: 12 }
  },

  Churn: {
    args: { label: 'Churn', value: 3.1, unit: '%', delta: -2 }
  },

  'Flat week': {
    args: { label: 'Sessions', value: week(120).at(-1), unit: '', delta: 0 }
  }
};
