import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discover } from '../src/core/discover.js';
import { createStoryRenderer } from '../src/core/render.js';

/**
 * A block's script may import modules now that the Vite plugin emits it as a
 * module. Studio evaluates scripts in Node, without Vite, so discovery bundles
 * the ones that import something (or are TypeScript) with esbuild. Without
 * that, `lego-studio snap` would fail on every block that imports a helper.
 */
describe('discovery of scripts that import modules', () => {
  let root;
  let manifest;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-imports-'));
    const write = async (relative, content) => {
      const file = path.join(root, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, 'utf8');
    };

    await write('lib/money.js', 'export const money = (n) => `$${n.toFixed(2)}`;\n');
    await write('blocks/price-tag.lego', `<script>
import { money } from '../lib/money.js';
import { Lego } from 'lego-dom';
const TAX = 0.2;
export default {
  total: 10,
  get label() { return money(this.total * (1 + TAX)); },
  get app() { return typeof Lego.block; }
}
</script>
<template><p>[[ label ]] [[ app ]]</p></template>
`);
    await write('blocks/ts-tag.lego', `<script lang="ts">
const items: number[] = [2, 3];
export default { get sum(): number { return items.reduce((s, n) => s + n, 0); } }
</script>
<template><p>[[ sum ]]</p></template>
`);
    await write('blocks/missing-dep.lego', `<script>
import { nope } from './does-not-exist.js';
export default { a: nope }
</script>
<template><p>x</p></template>
`);

    manifest = await discover({ root });
  });

  afterAll(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  const render = (tag) => createStoryRenderer(manifest).render(manifest.blocks[tag].stories[0]);

  it('evaluates a script that imports a helper and lego-dom', () => {
    expect(manifest.blocks['price-tag'].stateKeys).toContain('total');
    expect(render('price-tag')).toContain('<p>$12.00 function</p>');
  });

  it('evaluates a TypeScript script', () => {
    expect(render('ts-tag')).toContain('<p>5</p>');
  });

  it('reports a script whose import cannot be resolved, and only that one', () => {
    const errors = manifest.errors.filter(e => e.includes('script section'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/missing-dep/);
  });
});
