import { describe, it, expect } from 'vitest';
import { parseLego, generateBlockCall } from '../src/utils/parser-utils.js';

/**
 * `<story>` sections are Lego Studio's authoring surface for block variants.
 * They live in the .lego file so a variant sits next to the block it varies,
 * but they are development metadata: the parser lifts them out of the stream
 * so nothing they declare can reach the template, and generateBlockCall never
 * emits them, so they cost a production bundle nothing.
 */
describe('story sections', () => {
  const source = `
<template b-props="loading: Boolean = false, title: String">
  <h2>[[ title ]]</h2>
  <slot></slot>
</template>

<story name="Loading" args="{ loading: true, title: 'Fetching' }">
  <p>spinner goes here</p>
</story>

<story name="Empty" args="{ title: '' }" globals="{ theme: 'dark' }"></story>

<script>
export default { title: 'Untitled' }
</script>

<style>
  h2 { margin: 0; }
</style>
`;

  it('collects every story with its raw attribute sources', () => {
    const parsed = parseLego(source, 'data-panel.lego');

    expect(parsed.stories).toHaveLength(2);
    expect(parsed.stories[0]).toEqual({
      name: 'Loading',
      args: "{ loading: true, title: 'Fetching' }",
      globals: '',
      slotHTML: '<p>spinner goes here</p>'
    });
    expect(parsed.stories[1].name).toBe('Empty');
    expect(parsed.stories[1].globals).toBe("{ theme: 'dark' }");
    expect(parsed.stories[1].slotHTML).toBe('');
  });

  it('keeps story markup out of the template and the other sections', () => {
    const parsed = parseLego(source, 'data-panel.lego');

    expect(parsed.template).toContain('[[ title ]]');
    expect(parsed.template).not.toContain('spinner goes here');
    expect(parsed.script).toBe("export default { title: 'Untitled' }");
    expect(parsed.style).toBe('h2 { margin: 0; }');
    expect(parsed.propsAttr).toBe('loading: Boolean = false, title: String');
  });

  it('never emits a story into the generated block call', () => {
    const parsed = parseLego(source, 'data-panel.lego');
    const code = generateBlockCall(parsed);

    expect(code).toContain("Lego.block('data-panel'");
    expect(code).not.toContain('spinner goes here');
    expect(code).not.toContain('Loading');
  });

  it('names an unnamed story by its position', () => {
    const parsed = parseLego('<story>only content</story>', 'lone-block.lego');

    expect(parsed.stories[0].name).toBe('Story 1');
    expect(parsed.stories[0].slotHTML).toBe('only content');
  });

  it('leaves a file with no stories with an empty list', () => {
    const parsed = parseLego('<template><b>hi</b></template>', 'plain-block.lego');

    expect(parsed.stories).toEqual([]);
    expect(parsed.template).toBe('<b>hi</b>');
  });

  it('does not treat a template that follows a story as part of it', () => {
    const parsed = parseLego(
      '<story name="First"><em>slotted</em></story><template><p>real</p></template>',
      'order-block.lego'
    );

    expect(parsed.template).toBe('<p>real</p>');
    expect(parsed.stories[0].slotHTML).toBe('<em>slotted</em>');
  });
});
