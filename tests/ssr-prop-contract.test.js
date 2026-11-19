import { describe, it, expect, vi } from 'vitest';
import { createRenderer } from '../src/server/index.js';
import { parseProps } from '../src/directives/b-props.js';

/**
 * The server renderer used to carry its own `b-props` parser, and it only
 * understood bare names. Anything with a type or a default was rejected
 * wholesale, so a block declaring `label: String = 'Save'` server rendered
 * with no prop contract at all: plain attributes stopped reaching state and
 * declared defaults never appeared. Both halves now read the one grammar in
 * src/directives/b-props.js.
 */
describe('server prop contract', () => {
  it('parses a typed, defaulted declaration the way the client does', () => {
    const declared = parseProps("label: String = 'Save', count: Number = 0, busy: Boolean", 'x-y');

    expect(declared.map(p => p.name)).toEqual(['label', 'count', 'busy']);
    expect(declared.map(p => p.type)).toEqual(['String', 'Number', 'Boolean']);
    expect(declared[0].defaultSource).toBe("'Save'");
    expect(declared[0].defaultFn()).toBe('Save');
    expect(declared[2].defaultFn).toBe(null);
  });

  it('renders declared defaults when the caller passes nothing', () => {
    const renderer = createRenderer();
    renderer.define('ui-counter', {
      template: '<span>[[ label ]]:[[ count ]]:[[ busy ]]</span>',
      props: "label: String = 'Save', count: Number = 0, busy: Boolean"
    });

    const html = renderer.renderToString('ui-counter');

    expect(html).toContain('<span>Save:0:false</span>');
  });

  it('lets a caller override a default', () => {
    const renderer = createRenderer();
    renderer.define('ui-counter', {
      template: '<span>[[ count ]]</span>',
      props: 'count: Number = 0'
    });

    expect(renderer.renderToString('ui-counter', { props: { count: 7 } })).toContain('<span>7</span>');
  });

  it('lets block logic win over a declared default', () => {
    const renderer = createRenderer();
    renderer.define('ui-counter', {
      template: '<span>[[ count ]]</span>',
      logic: { count: 41 },
      props: 'count: Number = 0'
    });

    expect(renderer.renderToString('ui-counter')).toContain('<span>41</span>');
  });

  it('gives each render its own copy of an object or array default', () => {
    const renderer = createRenderer();
    renderer.define('ui-list', {
      template: '<i>[[ items.length ]]</i>',
      props: 'items: Array = []'
    });

    const first = renderer.renderToString('ui-list', { props: { items: [1, 2] } });
    const second = renderer.renderToString('ui-list');

    expect(first).toContain('<i>2</i>');
    expect(second).toContain('<i>0</i>');
  });

  it('does not log an error for a valid typed declaration', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = createRenderer();
    renderer.define('ui-typed', { template: '<b>[[ a ]]</b>', props: "a: String = 'x'" });

    expect(spy).not.toHaveBeenCalled();
    expect(renderer.renderToString('ui-typed')).toContain('<b>x</b>');
    spy.mockRestore();
  });

  it('still accepts the plain name array getDefinitions hands over', () => {
    const renderer = createRenderer();
    renderer.define('ui-plain', { template: '<b>[[ a ]]</b>', props: ['a'] });

    expect(renderer.renderToString('ui-plain', { props: { a: 'ok' } })).toContain('<b>ok</b>');
  });

  it('reaches a defaulted prop through defineLegoFile', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(
      `<template b-props="title: String = 'Untitled'"><h1>[[ title ]]</h1></template>`,
      'doc-header.lego'
    );

    expect(renderer.renderToString('doc-header')).toContain('<h1>Untitled</h1>');
  });

  it('gives a script section the same Lego and $db the client gives it', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(
      `<template><b>[[ stored ]]</b></template>
<script>
export default { stored: typeof Lego === 'object' && typeof $db === 'function' ? 'both' : 'missing' }
</script>`,
      'db-block.lego'
    );

    expect(renderer.renderToString('db-block')).toContain('<b>both</b>');
  });
});
