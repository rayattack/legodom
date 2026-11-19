/**
 * The controls panel, as data.
 *
 * Storybook needs a per-framework docgen pass to learn what a component's
 * props are, and even then most teams hand-author `argTypes` on top. LegoDOM
 * already ships a machine readable prop contract in `b-props`, so the whole
 * of the controls panel is a pure function of a `PropDescriptor[]` and the
 * story's current args. Nothing is authored. That is the headline feature,
 * and this module is the part of it worth testing on its own: it has no DOM,
 * no Lego, and no postMessage in it, so it runs in bare Node.
 *
 * Two directions, both here:
 *   descriptors + args -> rows   (buildControlRows, what the panel renders)
 *   row + raw input    -> patch  (applyControlInput, what an edit means)
 *
 * `controlFor` lives in the frozen contracts module and decides the widget.
 * A descriptor produced by discover.js already carries `control`; the
 * fallback is here so a hand-built descriptor still lands somewhere sane.
 */

import { controlFor } from '../../core/contracts.js';

/** Structural equality, good enough to decide "is this arg still the default". */
export const sameArg = (a, b) => {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
};

/**
 * The editable representation of a value for a given control.
 *
 * Text, number and json controls edit a string; boolean edits a real boolean.
 * `undefined` means "the prop has no value", which for a text field is an
 * empty box rather than the literal word "undefined".
 */
export const formatArgValue = (control, value) => {
  if (control === 'boolean') return value === true || value === 'true';
  if (control === 'json') {
    if (value === undefined) return '';
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return '';
    }
  }
  if (value === undefined || value === null) return '';
  return String(value);
};

/** One-line rendering of a value for the "default:" hint beside a control. */
const compact = (value) => {
  if (value === undefined) return '';
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch (e) {
    return String(value);
  }
};

/**
 * What to show as the declared default. The author's own source text wins,
 * because `items: Array = []` reads better than `[]` evaluated, and because
 * a default expression can be non-obvious.
 */
export const describeDefault = (descriptor) => {
  if (descriptor.defaultSource) return String(descriptor.defaultSource);
  return compact(descriptor.defaultValue);
};

/**
 * Turn what an input element handed back into a typed arg value.
 *
 * Never throws. A control that cannot make sense of its input reports
 * `ok: false` with a message the panel shows inline, and the caller is
 * expected not to post anything in that case: half-typed JSON must not reach
 * the preview.
 *
 * @param {string} control - 'text' | 'number' | 'boolean' | 'json' | 'none'
 * @param {*} raw - `input.value`, or `input.checked` for a checkbox
 * @returns {{ok: boolean, value: *, error: string}}
 */
export const readControlInput = (control, raw) => {
  if (control === 'boolean') {
    // An unchecked box reports false; an absent one (no element, no event)
    // reports undefined. Both mean the same thing to a Boolean prop, which
    // is exactly what b-props does with a missing attribute.
    return { ok: true, value: raw === true || raw === 'true' || raw === 'on', error: '' };
  }
  if (control === 'none') {
    return { ok: false, value: undefined, error: 'Function props cannot be edited here.' };
  }

  const text = (raw === undefined || raw === null) ? '' : String(raw);

  if (control === 'number') {
    // Number('') is 0, which would silently invent a value for an empty box.
    // Empty means "no value", and anything else has to parse.
    if (text.trim() === '') return { ok: true, value: undefined, error: '' };
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      return { ok: false, value: undefined, error: `"${text}" is not a number.` };
    }
    return { ok: true, value: parsed, error: '' };
  }

  if (control === 'json') {
    if (text.trim() === '') return { ok: true, value: undefined, error: '' };
    try {
      return { ok: true, value: JSON.parse(text), error: '' };
    } catch (e) {
      return { ok: false, value: undefined, error: e.message };
    }
  }

  return { ok: true, value: text, error: '' };
};

/**
 * One control row: everything the template needs and nothing it does not.
 *
 * `value` is what the widget edits (string, or boolean for a checkbox) and is
 * what `b-sync` writes back into. `arg` is the typed value the preview gets.
 * They are deliberately separate: "1e" is a legitimate thing to have in a
 * number box on the way to typing "1e3", and it is not a legitimate arg.
 */
export const buildControlRow = (descriptor, args) => {
  const control = descriptor.control || controlFor(descriptor.type);
  const source = args || {};
  const present = Object.prototype.hasOwnProperty.call(source, descriptor.name);
  const arg = present ? source[descriptor.name] : descriptor.defaultValue;
  return {
    name: descriptor.name,
    attr: descriptor.attr || '',
    type: descriptor.type || 'any',
    control,
    disabled: control === 'none',
    defaultLabel: describeDefault(descriptor),
    defaultValue: descriptor.defaultValue,
    arg,
    value: formatArgValue(control, arg),
    modified: !sameArg(arg, descriptor.defaultValue),
    error: ''
  };
};

/** Every declared prop of a block, as a row, in declaration order. */
export const buildControlRows = (descriptors, args) =>
  (Array.isArray(descriptors) ? descriptors : []).map(d => buildControlRow(d, args));

/**
 * What an edit does to a row.
 *
 * Returns a patch rather than mutating, so the caller decides whether the
 * edit is worth committing. A failed parse still updates `value` (the user's
 * text stays on screen) but leaves `arg` where it was, so the last good value
 * is what the preview keeps showing.
 *
 * @param {object} row - a row from buildControlRow
 * @param {*} raw - the widget's raw value
 * @returns {{ok: boolean, value: *, arg: *, error: string, modified: boolean}}
 */
export const applyControlInput = (row, raw) => {
  const result = readControlInput(row.control, raw);
  const value = row.control === 'boolean'
    ? result.value
    : ((raw === undefined || raw === null) ? '' : String(raw));

  if (!result.ok) {
    return { ok: false, value, arg: row.arg, error: result.error, modified: row.modified };
  }
  return {
    ok: true,
    value,
    arg: result.value,
    error: '',
    modified: !sameArg(result.value, row.defaultValue)
  };
};

/**
 * The full arg set the rows currently describe, which is what PROTOCOL.ARGS
 * carries. Props with no value at all are left out entirely rather than sent
 * as null: the block's own b-props default is a better answer than null, and
 * omitting the key is how you ask for it.
 */
export const rowsToArgs = (rows) => {
  const out = {};
  (rows || []).forEach(row => {
    if (row.disabled) return;
    if (row.arg === undefined) return;
    out[row.name] = row.arg;
  });
  return out;
};
