import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from '../src/core/discover.js';
import { controlFor } from '../src/core/contracts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');

/** Fields the contract names on BlockInfo, so a dropped one fails loudly. */
const BLOCK_FIELDS = [
  'tag', 'file', 'relFile', 'shadow', 'form', 'template', 'css', 'script',
  'propsAttr', 'props', 'stateKeys', 'methodKeys', 'emits', 'slots',
  'children', 'storyFiles', 'stories'
];

const PROP_FIELDS = ['name', 'attr', 'type', 'defaultSource', 'defaultValue', 'control'];

describe('discover', () => {
  let manifest;

  beforeAll(async () => {
    manifest = await discover({ root: FIXTURES });
  });

  it('returns a manifest with the shape the contract names', () => {
    expect(Object.keys(manifest).sort()).toEqual(['blocks', 'errors', 'order', 'root']);
    expect(manifest.root).toBe(FIXTURES);
    expect(manifest.errors).toEqual([]);
    expect(manifest.order).toEqual([...manifest.order].sort());
    expect(manifest.order).toEqual(Object.keys(manifest.blocks).sort());
  });

  it('fills every BlockInfo field for every block', () => {
    manifest.order.forEach((tag) => {
      const block = manifest.blocks[tag];
      BLOCK_FIELDS.forEach((field) => {
        expect(block, `${tag} is missing ${field}`).toHaveProperty(field);
      });
      expect(block.tag).toBe(tag);
      expect(path.isAbsolute(block.file)).toBe(true);
      expect(block.relFile).toBe(path.relative(FIXTURES, block.file));
      expect(typeof block.shadow).toBe('boolean');
      expect(typeof block.form).toBe('boolean');
      expect(typeof block.template).toBe('string');
      expect(typeof block.css).toBe('string');
      expect(typeof block.script).toBe('string');
      expect(Array.isArray(block.props)).toBe(true);
      expect(Array.isArray(block.stateKeys)).toBe(true);
      expect(Array.isArray(block.methodKeys)).toBe(true);
      expect(Array.isArray(block.emits)).toBe(true);
      expect(Array.isArray(block.slots)).toBe(true);
      expect(Array.isArray(block.children)).toBe(true);
      expect(Array.isArray(block.storyFiles)).toBe(true);
      block.storyFiles.forEach((file) => expect(path.isAbsolute(file)).toBe(true));
      expect(block.stories.length).toBeGreaterThan(0);
    });
  });

  it('describes a String prop with a quoted default', () => {
    const label = manifest.blocks['ui-button'].props.find((prop) => prop.name === 'label');
    expect(Object.keys(label).sort()).toEqual([...PROP_FIELDS].sort());
    expect(label).toMatchObject({
      name: 'label',
      attr: 'label',
      type: 'String',
      defaultSource: "'Save'",
      defaultValue: 'Save',
      control: 'text'
    });
  });

  it('describes a Number prop', () => {
    const size = manifest.blocks['ui-avatar'].props.find((prop) => prop.name === 'size');
    expect(size).toMatchObject({
      type: 'Number',
      defaultSource: '40',
      defaultValue: 40,
      control: 'number'
    });
  });

  it('describes a Boolean prop declared without a default', () => {
    const busy = manifest.blocks['ui-button'].props.find((prop) => prop.name === 'busy');
    expect(busy).toMatchObject({
      type: 'Boolean',
      defaultSource: null,
      defaultValue: undefined,
      control: 'boolean'
    });
  });

  it('describes Object and Array props as json controls', () => {
    const user = manifest.blocks['ui-avatar'].props.find((prop) => prop.name === 'user');
    expect(user.type).toBe('Object');
    expect(user.control).toBe('json');
    expect(user.defaultValue).toEqual({ name: 'Ada Lovelace', role: 'Engineer' });

    const entries = manifest.blocks['ui-panel'].props.find((prop) => prop.name === 'entries');
    expect(entries.type).toBe('Array');
    expect(entries.control).toBe('json');
    expect(entries.defaultValue).toEqual([]);
  });

  it('agrees with controlFor for every prop it describes', () => {
    manifest.order.forEach((tag) => {
      manifest.blocks[tag].props.forEach((prop) => {
        expect(prop.control).toBe(controlFor(prop.type));
      });
    });
  });

  it('hands each declared default a fresh value per block', async () => {
    const again = await discover({ root: FIXTURES });
    const first = manifest.blocks['ui-panel'].props.find((prop) => prop.name === 'entries');
    const second = again.blocks['ui-panel'].props.find((prop) => prop.name === 'entries');
    expect(first.defaultValue).not.toBe(second.defaultValue);
  });

  it('classifies getters as state without invoking them', () => {
    const stat = manifest.blocks['ui-stat'];
    expect(stat.stateKeys).toEqual(['direction', 'sign']);
    expect(stat.methodKeys).toEqual([]);
  });

  it('separates methods from state and skips declared props', () => {
    const button = manifest.blocks['ui-button'];
    expect(button.stateKeys).toEqual(['busyLabel']);
    expect(button.methodKeys).toEqual(['press']);
    expect(button.stateKeys).not.toContain('label');
    expect(button.stateKeys).not.toContain('busy');
  });

  it('collects emitted event names, deduped and sorted', () => {
    expect(manifest.blocks['ui-button'].emits).toEqual(['press']);
    expect(manifest.blocks['ui-avatar'].emits).toEqual(['avatar-open']);
    expect(manifest.blocks['ui-card'].emits).toEqual([]);
  });

  it('collects slot names with the default slot as an empty string', () => {
    expect(manifest.blocks['ui-card'].slots).toEqual(['header', '', 'footer']);
    expect(manifest.blocks['ui-button'].slots).toEqual(['']);
    expect(manifest.blocks['ui-stat'].slots).toEqual([]);
  });

  it('records child edges only for tags that are themselves blocks', () => {
    expect(manifest.blocks['ui-panel'].children).toEqual([
      'ui-avatar', 'ui-badge', 'ui-button', 'ui-card'
    ]);
    expect(manifest.blocks['ui-card'].children).toEqual([]);
  });

  it('keeps the self edge of a block that recurses', () => {
    expect(manifest.blocks['ui-tree'].children).toEqual(['ui-tree']);
    expect(manifest.blocks['ui-tree'].template).toContain('<ui-tree');
  });

  it('names the story modules it loaded, and only those', () => {
    expect(manifest.blocks['ui-stat'].storyFiles).toEqual([
      path.join(FIXTURES, 'ui-stat.stories.js')
    ]);
    expect(manifest.blocks['ui-button'].storyFiles).toEqual([]);
    expect(manifest.blocks['ui-card'].storyFiles).toEqual([]);
  });

  it('reads b-shadow="false" as a light DOM block', () => {
    expect(manifest.blocks['ui-badge'].shadow).toBe(false);
    expect(manifest.blocks['ui-card'].shadow).toBe(true);
  });

  it('produces the same manifest twice', async () => {
    const again = await discover({ root: FIXTURES });
    expect(JSON.stringify(again)).toBe(JSON.stringify(manifest));
  });
});

describe('discover, filtering and failure', () => {
  let root;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-discover-'));
    const write = async (relative, content) => {
      const file = path.join(root, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, 'utf8');
    };

    await write('blocks/good-block.lego', '<template><p>ok</p></template>');
    await write('blocks/other-block.lego', '<template><good-block></good-block></template>');
    await write('vendor/vendor-block.lego', '<template><p>vendor</p></template>');
    await write('node_modules/pkg/pkg-block.lego', '<template><p>no</p></template>');
    await write('dist/dist-block.lego', '<template><p>no</p></template>');
    await write('studio/studio-block.lego', '<template><p>no</p></template>');
    await write('lego-studio-panel.lego', '<template><p>internal</p></template>');
    await write('nohyphen.lego', '<template><p>unnamed</p></template>');
    await write('empty-block.lego', 'nothing at all');
    await write('broken-script.lego', '<template><p>x</p></template><script>export default { oops: (</script>');
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('skips node_modules, dist, .git and studio directories', async () => {
    const manifest = await discover({ root });
    expect(manifest.order).toContain('good-block');
    expect(manifest.order).toContain('vendor-block');
    expect(manifest.order).not.toContain('pkg-block');
    expect(manifest.order).not.toContain('dist-block');
    expect(manifest.order).not.toContain('studio-block');
  });

  it('skips blocks the studio reserves for itself', async () => {
    const manifest = await discover({ root });
    expect(manifest.order).not.toContain('lego-studio-panel');
  });

  it('records a parse failure and keeps going', async () => {
    const manifest = await discover({ root });
    expect(manifest.errors.some((message) => message.includes('nohyphen.lego'))).toBe(true);
    expect(manifest.errors.some((message) => message.includes('empty-block.lego'))).toBe(true);
    expect(manifest.order).toContain('good-block');
  });

  it('records a script that will not evaluate but keeps the block', async () => {
    const manifest = await discover({ root });
    expect(manifest.order).toContain('broken-script');
    expect(manifest.blocks['broken-script'].stateKeys).toEqual([]);
    expect(manifest.errors.some((message) => message.includes('broken-script'))).toBe(true);
  });

  it('honours include and exclude globs', async () => {
    const only = await discover({ root, include: ['blocks/**/*.lego'] });
    expect(only.order).toEqual(['good-block', 'other-block']);

    const without = await discover({
      root,
      include: ['blocks/**/*.lego'],
      exclude: ['blocks/other-*.lego']
    });
    expect(without.order).toEqual(['good-block']);
  });

  it('never throws on a root that does not exist', async () => {
    const manifest = await discover({ root: path.join(root, 'missing') });
    expect(manifest.order).toEqual([]);
    expect(manifest.errors.length).toBe(1);
  });
});
