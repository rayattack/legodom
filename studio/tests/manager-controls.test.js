/**
 * The controls panel's model, tested without a DOM.
 *
 * The whole point of the panel is that it is a pure function of the block's
 * `b-props` contract and the story's args, so the interesting behaviour can
 * be exercised in bare Node. Anything that needs an element (the b-sync
 * plumbing, the debounce) is deliberately not in here: it is not what breaks.
 */

import { describe, it, expect } from 'vitest';
import { controlFor } from '../src/core/contracts.js';
import {
  applyControlInput,
  buildControlRow,
  buildControlRows,
  describeDefault,
  formatArgValue,
  readControlInput,
  rowsToArgs,
  sameArg
} from '../src/manager/blocks/controls-model.js';

/** A PropDescriptor as discovery produces one. */
const descriptor = (over = {}) => Object.assign({
  name: 'title',
  attr: 'title',
  type: 'String',
  defaultSource: null,
  defaultValue: undefined,
  control: controlFor(over.type === undefined ? 'String' : over.type)
}, over);

describe('controlFor is the only widget decision', () => {
  it('maps every b-props type', () => {
    expect(controlFor('String')).toBe('text');
    expect(controlFor('Number')).toBe('number');
    expect(controlFor('Boolean')).toBe('boolean');
    expect(controlFor('Array')).toBe('json');
    expect(controlFor('Object')).toBe('json');
    expect(controlFor('Function')).toBe('none');
    expect(controlFor(null)).toBe('text');
  });

  it('falls back to controlFor when a descriptor carries no control', () => {
    const row = buildControlRow({ name: 'count', attr: 'count', type: 'Number' }, {});
    expect(row.control).toBe('number');
  });
});

describe('readControlInput: text', () => {
  it('passes strings through', () => {
    expect(readControlInput('text', 'Save')).toEqual({ ok: true, value: 'Save', error: '' });
  });

  it('treats an empty box as an empty string, not as absent', () => {
    expect(readControlInput('text', '')).toEqual({ ok: true, value: '', error: '' });
  });

  it('coerces a non-string to its string form', () => {
    expect(readControlInput('text', 42).value).toBe('42');
    expect(readControlInput('text', undefined).value).toBe('');
    expect(readControlInput('text', null).value).toBe('');
  });
});

describe('readControlInput: number', () => {
  it('writes back a Number, not a numeric string', () => {
    const result = readControlInput('number', '42');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
    expect(typeof result.value).toBe('number');
  });

  it('keeps zero, which is the coercion bug everyone ships', () => {
    expect(readControlInput('number', '0').value).toBe(0);
  });

  it('reads negatives, decimals and exponents', () => {
    expect(readControlInput('number', '-3.5').value).toBe(-3.5);
    expect(readControlInput('number', '1e3').value).toBe(1000);
  });

  it('refuses to invent 0 for an empty box', () => {
    expect(readControlInput('number', '')).toEqual({ ok: true, value: undefined, error: '' });
    expect(readControlInput('number', '   ')).toEqual({ ok: true, value: undefined, error: '' });
  });

  it('reports unparseable text instead of posting NaN', () => {
    const result = readControlInput('number', '1e');
    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.error).toContain('1e');
  });

  it('rejects words', () => {
    expect(readControlInput('number', 'twelve').ok).toBe(false);
  });
});

describe('readControlInput: boolean', () => {
  it('reads a checked box', () => {
    expect(readControlInput('boolean', true)).toEqual({ ok: true, value: true, error: '' });
  });

  it('reads an unchecked box', () => {
    expect(readControlInput('boolean', false).value).toBe(false);
  });

  it('reads absence as false, the same as a missing attribute', () => {
    expect(readControlInput('boolean', undefined).value).toBe(false);
    expect(readControlInput('boolean', null).value).toBe(false);
  });

  it('accepts the string forms a form control can hand back', () => {
    expect(readControlInput('boolean', 'true').value).toBe(true);
    expect(readControlInput('boolean', 'on').value).toBe(true);
    expect(readControlInput('boolean', 'false').value).toBe(false);
    expect(readControlInput('boolean', '').value).toBe(false);
  });

  it('never fails', () => {
    expect(readControlInput('boolean', {}).ok).toBe(true);
  });
});

describe('readControlInput: json', () => {
  it('parses objects and arrays', () => {
    expect(readControlInput('json', '{"a":1}').value).toEqual({ a: 1 });
    expect(readControlInput('json', '[1,2,3]').value).toEqual([1, 2, 3]);
  });

  it('parses bare JSON literals', () => {
    expect(readControlInput('json', 'null').value).toBeNull();
    expect(readControlInput('json', '7').value).toBe(7);
    expect(readControlInput('json', 'false').value).toBe(false);
  });

  it('treats an empty textarea as absent', () => {
    expect(readControlInput('json', '')).toEqual({ ok: true, value: undefined, error: '' });
    expect(readControlInput('json', '\n  \n').value).toBeUndefined();
  });

  it('reports invalid JSON and produces no value', () => {
    const result = readControlInput('json', '{a: 1}');
    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it('reports half-typed JSON', () => {
    expect(readControlInput('json', '[1,').ok).toBe(false);
    expect(readControlInput('json', '{"a":').ok).toBe(false);
  });
});

describe('readControlInput: none', () => {
  it('never yields a value for a Function prop', () => {
    const result = readControlInput('none', 'anything');
    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});

describe('formatArgValue', () => {
  it('renders text and number values as strings', () => {
    expect(formatArgValue('text', 'hi')).toBe('hi');
    expect(formatArgValue('number', 0)).toBe('0');
    expect(formatArgValue('number', undefined)).toBe('');
    expect(formatArgValue('text', null)).toBe('');
  });

  it('renders booleans as real booleans, so a checkbox can bind to them', () => {
    expect(formatArgValue('boolean', true)).toBe(true);
    expect(formatArgValue('boolean', false)).toBe(false);
    expect(formatArgValue('boolean', undefined)).toBe(false);
  });

  it('pretty prints json values and leaves an absent one empty', () => {
    expect(formatArgValue('json', { a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatArgValue('json', undefined)).toBe('');
  });
});

describe('describeDefault', () => {
  it('prefers the author\'s own default expression', () => {
    expect(describeDefault(descriptor({ defaultSource: '[]', defaultValue: [] }))).toBe('[]');
  });

  it('falls back to the evaluated value', () => {
    expect(describeDefault(descriptor({ type: 'Number', defaultValue: 3 }))).toBe('3');
    expect(describeDefault(descriptor({ defaultValue: 'Save' }))).toBe('"Save"');
  });

  it('is empty for a prop with no default at all', () => {
    expect(describeDefault(descriptor())).toBe('');
  });
});

describe('buildControlRow', () => {
  it('uses the declared default when args say nothing', () => {
    const row = buildControlRow(
      descriptor({ name: 'label', attr: 'label', defaultSource: "'Save'", defaultValue: 'Save' }),
      {}
    );
    expect(row.arg).toBe('Save');
    expect(row.value).toBe('Save');
    expect(row.modified).toBe(false);
    expect(row.defaultLabel).toBe("'Save'");
    expect(row.disabled).toBe(false);
  });

  it('uses the story arg when there is one, and marks the row modified', () => {
    const row = buildControlRow(
      descriptor({ name: 'label', attr: 'label', defaultValue: 'Save' }),
      { label: 'Delete' }
    );
    expect(row.arg).toBe('Delete');
    expect(row.modified).toBe(true);
  });

  it('honours a story arg that happens to equal the default', () => {
    const row = buildControlRow(descriptor({ defaultValue: 'Save' }), { title: 'Save' });
    expect(row.modified).toBe(false);
  });

  it('distinguishes an explicit undefined arg from an absent one', () => {
    const spec = descriptor({ type: 'Number', control: 'number', defaultValue: 5 });
    expect(buildControlRow(spec, {}).arg).toBe(5);
    expect(buildControlRow(spec, { title: undefined }).arg).toBeUndefined();
  });

  it('compares object args structurally rather than by identity', () => {
    const spec = descriptor({ type: 'Array', control: 'json', defaultValue: [1, 2] });
    expect(buildControlRow(spec, { title: [1, 2] }).modified).toBe(false);
    expect(buildControlRow(spec, { title: [1, 3] }).modified).toBe(true);
  });

  it('disables a Function prop and still shows its type', () => {
    const row = buildControlRow(descriptor({ type: 'Function', control: 'none' }), {});
    expect(row.control).toBe('none');
    expect(row.disabled).toBe(true);
    expect(row.type).toBe('Function');
  });

  it('reports "any" for an undeclared type', () => {
    expect(buildControlRow({ name: 'x', attr: 'x', type: null }, {}).type).toBe('any');
  });

  it('starts every row without an error', () => {
    expect(buildControlRow(descriptor(), {}).error).toBe('');
  });
});

describe('buildControlRows', () => {
  it('keeps declaration order and one row per prop', () => {
    const rows = buildControlRows([
      descriptor({ name: 'a', attr: 'a' }),
      descriptor({ name: 'b', attr: 'b', type: 'Number', control: 'number' })
    ], {});
    expect(rows.map(r => r.name)).toEqual(['a', 'b']);
    expect(rows.map(r => r.control)).toEqual(['text', 'number']);
  });

  it('survives a block with no props', () => {
    expect(buildControlRows([], {})).toEqual([]);
    expect(buildControlRows(undefined, undefined)).toEqual([]);
  });
});

describe('applyControlInput', () => {
  const rowFor = (over, args) => buildControlRow(descriptor(over), args || {});

  it('accepts a text edit and recomputes modified', () => {
    const row = rowFor({ defaultValue: 'Save' });
    const patch = applyControlInput(row, 'Delete');
    expect(patch).toEqual({ ok: true, value: 'Delete', arg: 'Delete', error: '', modified: true });
  });

  it('reports unmodified when an edit lands back on the default', () => {
    const row = rowFor({ defaultValue: 'Save' }, { title: 'Delete' });
    expect(applyControlInput(row, 'Save').modified).toBe(false);
  });

  it('types a number edit', () => {
    const row = rowFor({ type: 'Number', control: 'number', defaultValue: 1 });
    const patch = applyControlInput(row, '7');
    expect(patch.arg).toBe(7);
    expect(patch.value).toBe('7');
  });

  it('keeps the last good arg when a number edit does not parse', () => {
    const row = rowFor({ type: 'Number', control: 'number', defaultValue: 1 }, { title: 9 });
    const patch = applyControlInput(row, '9e');
    expect(patch.ok).toBe(false);
    expect(patch.arg).toBe(9);
    expect(patch.value).toBe('9e');
    expect(patch.error).toBeTruthy();
  });

  it('keeps the last good arg when json does not parse, and keeps the typed text', () => {
    const row = rowFor({ type: 'Object', control: 'json', defaultValue: { a: 1 } });
    const patch = applyControlInput(row, '{"a":');
    expect(patch.ok).toBe(false);
    expect(patch.arg).toEqual({ a: 1 });
    expect(patch.value).toBe('{"a":');
    expect(patch.error).toBeTruthy();
  });

  it('commits json once it parses again', () => {
    const row = rowFor({ type: 'Object', control: 'json', defaultValue: { a: 1 } });
    const patch = applyControlInput(row, '{"a":2}');
    expect(patch.ok).toBe(true);
    expect(patch.arg).toEqual({ a: 2 });
    expect(patch.modified).toBe(true);
  });

  it('keeps a boolean edit as a boolean, not a string', () => {
    const row = rowFor({ type: 'Boolean', control: 'boolean', defaultValue: false });
    const patch = applyControlInput(row, true);
    expect(patch.value).toBe(true);
    expect(patch.arg).toBe(true);
    expect(patch.modified).toBe(true);
  });

  it('refuses to edit a Function prop', () => {
    const row = rowFor({ type: 'Function', control: 'none' });
    expect(applyControlInput(row, 'x').ok).toBe(false);
  });
});

describe('rowsToArgs', () => {
  it('sends the full current arg set, defaults included', () => {
    const rows = buildControlRows([
      descriptor({ name: 'label', attr: 'label', defaultValue: 'Save' }),
      descriptor({ name: 'count', attr: 'count', type: 'Number', control: 'number', defaultValue: 2 })
    ], { count: 5 });
    expect(rowsToArgs(rows)).toEqual({ label: 'Save', count: 5 });
  });

  it('keeps falsy values, which is where naive implementations drop props', () => {
    const rows = buildControlRows([
      descriptor({ name: 'flag', attr: 'flag', type: 'Boolean', control: 'boolean', defaultValue: false }),
      descriptor({ name: 'count', attr: 'count', type: 'Number', control: 'number', defaultValue: 0 }),
      descriptor({ name: 'label', attr: 'label', defaultValue: '' })
    ], {});
    expect(rowsToArgs(rows)).toEqual({ flag: false, count: 0, label: '' });
  });

  it('omits a prop with no value rather than sending null', () => {
    const rows = buildControlRows([descriptor({ name: 'label', attr: 'label' })], {});
    expect(rowsToArgs(rows)).toEqual({});
  });

  it('never sends a Function prop', () => {
    const rows = buildControlRows([
      descriptor({ name: 'onPick', attr: 'on-pick', type: 'Function', control: 'none', defaultValue: 'x' })
    ], {});
    expect(rowsToArgs(rows)).toEqual({});
  });

  it('survives being handed nothing', () => {
    expect(rowsToArgs(undefined)).toEqual({});
  });
});

describe('sameArg', () => {
  it('compares primitives by value', () => {
    expect(sameArg(1, 1)).toBe(true);
    expect(sameArg('a', 'a')).toBe(true);
    expect(sameArg(0, '0')).toBe(false);
    expect(sameArg(NaN, NaN)).toBe(true);
  });

  it('compares objects and arrays structurally', () => {
    expect(sameArg({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameArg([1, [2]], [1, [2]])).toBe(true);
    expect(sameArg({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('handles null against an object without throwing', () => {
    expect(sameArg(null, {})).toBe(false);
    expect(sameArg(null, null)).toBe(true);
    expect(sameArg(undefined, null)).toBe(false);
  });

  it('does not blow up on a circular value', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(sameArg(cyclic, { a: 1 })).toBe(false);
  });
});

describe('one full edit cycle', () => {
  it('goes descriptor -> row -> edit -> args without anything authored', () => {
    const props = [
      descriptor({ name: 'label', attr: 'label', defaultSource: "'Save'", defaultValue: 'Save' }),
      descriptor({ name: 'count', attr: 'count', type: 'Number', control: 'number', defaultSource: '0', defaultValue: 0 }),
      descriptor({ name: 'items', attr: 'items', type: 'Array', control: 'json', defaultSource: '[]', defaultValue: [] }),
      descriptor({ name: 'busy', attr: 'busy', type: 'Boolean', control: 'boolean', defaultValue: false })
    ];
    const rows = buildControlRows(props, {});
    expect(rowsToArgs(rows)).toEqual({ label: 'Save', count: 0, items: [], busy: false });

    const commit = (name, raw) => {
      const row = rows.find(r => r.name === name);
      const patch = applyControlInput(row, raw);
      row.value = patch.value;
      row.error = patch.error;
      row.modified = patch.modified;
      if (patch.ok) row.arg = patch.arg;
      return patch;
    };

    commit('label', 'Delete');
    commit('count', '3');
    commit('busy', true);
    expect(commit('items', '["a"').ok).toBe(false);

    expect(rowsToArgs(rows)).toEqual({ label: 'Delete', count: 3, items: [], busy: true });
    expect(rows.find(r => r.name === 'items').error).toBeTruthy();
    expect(rows.filter(r => r.modified).map(r => r.name)).toEqual(['label', 'count', 'busy']);

    commit('items', '["a"]');
    expect(rowsToArgs(rows).items).toEqual(['a']);
    expect(rows.find(r => r.name === 'items').error).toBe('');
  });
});
