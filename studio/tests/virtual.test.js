import { describe, it, expect, vi } from 'vitest';
import {
  MANIFEST_ID,
  BLOCKS_ID,
  RESOLVED_MANIFEST_ID,
  RESOLVED_BLOCKS_ID,
  resolveVirtualId,
  manifestModule,
  blocksModule,
  emptyManifest,
  studioVirtuals
} from '../src/dev/virtual.js';
import { PROTOCOL } from '../src/core/contracts.js';

const fixture = () => ({
  root: '/project',
  order: ['b-card', 'a-button'],
  blocks: {
    'a-button': { tag: 'a-button', file: '/project/blocks/button.lego' },
    'b-card': { tag: 'b-card', file: '/project/blocks/card.lego' }
  },
  errors: []
});

describe('resolveVirtualId', () => {
  it('maps the bare specifiers onto NUL-prefixed ids', () => {
    expect(resolveVirtualId(MANIFEST_ID)).toBe(RESOLVED_MANIFEST_ID);
    expect(resolveVirtualId(BLOCKS_ID)).toBe(RESOLVED_BLOCKS_ID);
  });

  it('accepts an already-resolved id back as itself', () => {
    expect(resolveVirtualId(RESOLVED_MANIFEST_ID)).toBe(RESOLVED_MANIFEST_ID);
    expect(resolveVirtualId(RESOLVED_BLOCKS_ID)).toBe(RESOLVED_BLOCKS_ID);
  });

  it('ignores anything else', () => {
    expect(resolveVirtualId('virtual:lego-blocks')).toBeNull();
    expect(resolveVirtualId('/project/blocks/button.lego')).toBeNull();
    expect(resolveVirtualId(undefined)).toBeNull();
  });
});

describe('manifestModule', () => {
  it('default-exports the manifest as JSON', async () => {
    const manifest = fixture();
    const source = manifestModule(manifest);
    expect(source.startsWith('export default {')).toBe(true);

    const parsed = JSON.parse(source.replace(/^export default /, '').replace(/;\s*$/, ''));
    expect(parsed).toEqual(manifest);
  });

  it('falls back to an empty manifest', () => {
    const parsed = JSON.parse(manifestModule(null).replace(/^export default /, '').replace(/;\s*$/, ''));
    expect(parsed).toEqual({ root: '', blocks: {}, order: [], errors: [] });
  });
});

describe('blocksModule', () => {
  it('imports every discovered file in manifest.order', () => {
    const source = blocksModule(fixture());
    const imports = source.match(/^import .*$/gm);
    expect(imports).toEqual([
      'import "/project/blocks/card.lego?lego-block";',
      'import "/project/blocks/button.lego?lego-block";'
    ]);
  });

  it('reports how many files it imported', () => {
    expect(blocksModule(fixture())).toContain('export const count = 2;');
  });

  it('is a valid empty module when nothing was found', () => {
    const source = blocksModule(emptyManifest('/project'));
    expect(source).not.toMatch(/^import /m);
    expect(source).toContain('export const count = 0;');
  });

  it('skips tags whose entry carries no file and de-duplicates shared files', () => {
    const manifest = {
      root: '/p',
      order: ['a-one', 'a-two', 'a-three'],
      blocks: {
        'a-one': { file: '/p/one.lego' },
        'a-two': { file: '/p/one.lego' },
        'a-three': {}
      },
      errors: []
    };
    expect(blocksModule(manifest).match(/^import .*$/gm)).toEqual([
      'import "/p/one.lego?lego-block";'
    ]);
  });

  it('falls back to the block keys when order is missing', () => {
    const source = blocksModule({ blocks: { 'z-one': { file: '/p/z.lego' } } });
    expect(source).toContain('import "/p/z.lego?lego-block";');
  });
});

describe('studioVirtuals plugin', () => {
  it('resolves and loads both virtual modules from one discover() call', async () => {
    const discover = vi.fn().mockResolvedValue(fixture());
    const plugin = studioVirtuals({ root: '/project', include: ['**/*.lego'], discover });

    expect(plugin.name).toBe('lego-studio:virtual');
    expect(plugin.resolveId(MANIFEST_ID)).toBe(RESOLVED_MANIFEST_ID);

    const manifestSource = await plugin.load(RESOLVED_MANIFEST_ID);
    const blocksSource = await plugin.load(RESOLVED_BLOCKS_ID);

    expect(manifestSource).toContain('"a-button"');
    expect(blocksSource).toContain('button.lego?lego-block');
    expect(discover).toHaveBeenCalledTimes(1);
    expect(discover).toHaveBeenCalledWith({ root: '/project', include: ['**/*.lego'], exclude: undefined });
  });

  it('returns null for ids it does not own', async () => {
    const plugin = studioVirtuals({ root: '/project', discover: async () => fixture() });
    expect(plugin.resolveId('/project/blocks/button.lego')).toBeNull();
    expect(await plugin.load('/project/blocks/button.lego')).toBeNull();
  });

  it('serves an empty manifest when discover() throws', async () => {
    const plugin = studioVirtuals({
      root: '/project',
      discover: async () => { throw new Error('boom'); }
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const source = await plugin.load(RESOLVED_MANIFEST_ID);
    spy.mockRestore();
    expect(source).toContain('"blocks": {}');
    expect(source).toContain('boom');
  });

  it('re-runs discovery, drops both modules and notifies the client on invalidate', async () => {
    let round = 0;
    const discover = vi.fn(async () => {
      round += 1;
      return round === 1
        ? fixture()
        : { root: '/project', order: ['c-new'], blocks: { 'c-new': { file: '/project/new.lego' } }, errors: [] };
    });

    const plugin = studioVirtuals({ root: '/project', discover });

    const invalidated = [];
    const sent = [];
    const watcherHandlers = {};
    const server = {
      watcher: {
        add: vi.fn(),
        on: (event, fn) => { watcherHandlers[event] = fn; }
      },
      moduleGraph: {
        getModuleById: (id) => ({ id }),
        invalidateModule: (mod) => invalidated.push(mod.id)
      },
      ws: { send: (payload) => sent.push(payload) }
    };

    plugin.configureServer(server);
    expect(server.watcher.add).toHaveBeenCalledWith('/project');

    await plugin.load(RESOLVED_MANIFEST_ID);
    await plugin.api.invalidate();

    expect(discover).toHaveBeenCalledTimes(2);
    expect(invalidated).toEqual([RESOLVED_MANIFEST_ID, RESOLVED_BLOCKS_ID]);
    expect(sent).toEqual([{ type: 'custom', event: PROTOCOL.INVALIDATE }]);
    expect(await plugin.load(RESOLVED_BLOCKS_ID)).toContain('new.lego?lego-block');
  });

  it('only reacts to .lego files on the watcher', async () => {
    const discover = vi.fn().mockResolvedValue(fixture());
    const plugin = studioVirtuals({ root: '/project', discover });
    const handlers = {};
    plugin.configureServer({
      watcher: { add() {}, on: (event, fn) => { handlers[event] = fn; } },
      moduleGraph: { getModuleById: () => null, invalidateModule() {} },
      ws: { send() {} }
    });

    handlers.change('/project/notes.md');
    await new Promise((r) => setTimeout(r, 0));
    expect(discover).not.toHaveBeenCalled();

    handlers.change('/project/blocks/card.lego');
    await new Promise((r) => setTimeout(r, 0));
    expect(discover).toHaveBeenCalledTimes(1);
  });
});
