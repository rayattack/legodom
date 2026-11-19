import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseAst } from 'rollup/parseAst';
import { scriptModule, scriptFunctionBody, IMPORTS_NEED_BUNDLER, SCRIPT_LOGIC } from '../src/utils/parser-utils.js';
import { createRenderer } from '../src/server/index.js';
import { flush } from './test-utils.js';

/**
 * A `.lego` script section is module code. The Vite plugin used to lift the
 * default export's object literal out of the text and drop the rest, so an
 * `import`, a top-level constant or a helper function vanished, and the code
 * that used it threw at runtime (rendering as empty text outside strict mode).
 *
 * Now the plugin emits the script as a module. The paths with no module system
 * (the runtime loader, the server's defineLegoFile, Studio's plain path) run
 * it as a function body: top-level code works there, and an import is a loud
 * error instead of a silent drop.
 */

const repo = path.resolve(__dirname, '..');

const SCRIPT = `import { money } from './lib/money.js';
const TAX = 0.2; // ünïcödé before the export, to catch byte offsets
function withTax(n) { return n * (1 + TAX); }
export default {
  total: 10,
  get label() { return money(withTax(this.total)); }
}`;

describe('scriptModule', () => {
  for (const [mode, parse] of [['with a parser', (code) => parseAst(code)], ['from the text', null]]) {
    describe(mode, () => {
      it('keeps imports and top-level code and rebinds the default export', () => {
        const { code, logic } = scriptModule(SCRIPT, parse);
        expect(logic).toBe(SCRIPT_LOGIC);
        expect(code).toContain("import { money } from './lib/money.js';");
        expect(code).toContain('const TAX = 0.2;');
        expect(code).toContain('function withTax(n)');
        expect(code).toContain(`const ${SCRIPT_LOGIC} = {`);
        expect(code).not.toContain('export default');
      });

      it('reports whether the script declares Lego or $db itself', () => {
        const own = scriptModule(`import { Lego } from 'lego-dom';\nconst $db = 1;\nexport default {}`, parse);
        expect(own.declares('Lego')).toBe(true);
        expect(own.declares('$db')).toBe(true);
        const renamed = scriptModule(`import { Lego as App } from 'lego-dom';\nexport default {}`, parse);
        expect(renamed.declares('Lego')).toBe(false);
        expect(scriptModule(SCRIPT, parse).declares('Lego')).toBe(false);
      });
    });
  }

  it('passes the original bare object format through', () => {
    expect(scriptModule('{ n: 1, inc() { this.n++; } }', (code) => parseAst(code))).toMatchObject({
      code: '',
      logic: '({ n: 1, inc() { this.n++; } })'
    });
  });

  it('accepts a default export written as a specifier', () => {
    const { code, logic } = scriptModule('const logic = { n: 1 };\nexport { logic as default };');
    expect(logic).toBe('logic');
    expect(code).not.toContain('export');
  });

  it('rejects imports with no default export', () => {
    expect(() => scriptModule("import x from './x.js';\nconst y = x;")).toThrow(/export default/);
  });
});

describe('scriptFunctionBody', () => {
  const run = (script, Lego = {}, $db = () => 'db') => new Function('Lego', '$db', scriptFunctionBody(script))(Lego, $db);

  it('runs top-level helpers and constants', () => {
    const logic = run(`const TAX = 0.5;
function withTax(n) { return n * (1 + TAX); }
export default { get total() { return withTax(10); } }
export const extra = 1;`);
    expect(logic.total).toBe(15);
  });

  it('initializes constants declared after the default export', () => {
    expect(run('export default { get v() { return LATE; } }\nconst LATE = 3;').v).toBe(3);
  });

  it('provides Lego and $db, and lets a script declare its own', () => {
    expect(run('export default { a: Lego.name, b: $db() }', { name: 'app' })).toEqual({ a: 'app', b: 'db' });
    expect(run("const Lego = 'mine';\nexport default { a: Lego }", { name: 'app' }).a).toBe('mine');
  });

  it('refuses an import loudly', () => {
    expect(() => scriptFunctionBody("import { x } from './x.js';\nexport default {}")).toThrow(IMPORTS_NEED_BUNDLER);
  });

  it('still reads the bare object format', () => {
    expect(run('{ n: 2 }')).toEqual({ n: 2 });
  });
});

describe('server defineLegoFile', () => {
  it('evaluates top-level helpers', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(`<script>
const greet = (n) => 'Hi ' + n;
export default { name: 'Ada', get line() { return greet(this.name); } }
</script><template><p>[[ line ]]</p></template>`, 'greet-card.lego');
    expect(renderer.renderToString('greet-card')).toContain('<p>Hi Ada</p>');
  });

  it('says why an import cannot be evaluated', () => {
    expect(() => createRenderer().defineLegoFile(`<script>
import { x } from './x.js';
export default {}
</script><template>x</template>`, 'import-card.lego')).toThrow(/needs the Vite plugin/);
  });
});

describe('runtime defineLegoFile', () => {
  let win;

  beforeAll(async () => {
    const dom = new JSDOM('<!DOCTYPE html><body><helper-card></helper-card><import-card></import-card></body>', {
      url: 'http://localhost/',
      runScripts: 'dangerously'
    });
    win = dom.window;
    win.CSSStyleSheet = class { constructor() { this.cssRules = []; } replace() { return Promise.resolve(this); } };
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.eval(fs.readFileSync(path.join(repo, 'dist/lego.min.js'), 'utf8'));
    await win.Lego.init();
  });

  it('runs top-level helpers in a runtime-loaded file', async () => {
    win.Lego.defineLegoFile(`<script>
const double = (n) => n * 2;
export default { n: 4, get d() { return double(this.n); } }
</script><template><i>[[ d ]]</i></template>`, 'helper-card.lego');
    await flush(30);
    expect(win.document.querySelector('helper-card').shadowRoot.querySelector('i').textContent).toBe('8');
  });

  it('reports an import through onError instead of dropping it', () => {
    const onError = vi.fn();
    const previous = win.Lego.config.onError;
    win.Lego.config.onError = onError;
    try {
      win.Lego.defineLegoFile(`<script>
import { x } from './x.js';
export default { a: x }
</script><template>x</template>`, 'import-card.lego');
    } finally {
      win.Lego.config.onError = previous;
    }
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/needs the Vite plugin/);
    expect(onError.mock.calls[0][1]).toBe('script');
  });
});

describe('Vite plugin', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lego-script-'));
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    };
    write('src/lib/money.js', 'export const money = (n) => `$${n.toFixed(2)}`;\n');
    write('src/price-tag.lego', `<script>\n${SCRIPT}\n</script>\n<template><p>[[ label ]]</p></template>\n`);
    write('src/ts-tag.lego', `<script lang="ts">
import { money } from './lib/money.js';
interface Item { price: number }
const items: Item[] = [{ price: 2 }, { price: 3 }];
export default { get sum(): string { return money(items.reduce((s, i) => s + i.price, 0)); } }
</script>
<template><p>[[ sum ]]</p></template>
`);
    write('src/own-lego.lego', `<script>
import { Lego } from 'lego-dom';
const $db = 'mine';
export default { get who() { return typeof Lego.block + ':' + $db; } }
</script>
<template><p>[[ who ]]</p></template>
`);
    write('src/implicit-tag.lego', `<script>
export default { get who() { return typeof Lego.block + ':' + typeof $db; } }
</script>
<template><p>[[ who ]]</p></template>
`);
    write('src/legacy-tag.lego', '<script>\n{ n: 7 }\n</script>\n<template><p>[[ n ]]</p></template>\n');
    write('src/app.js', "import { Lego } from 'lego-dom';\nimport 'virtual:lego-blocks';\nwindow.__app = Lego;\n");
  });

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('builds blocks whose scripts import modules and declare helpers', async () => {
    const { build } = await import('vite');
    const { default: lego } = await import('../vite-plugin.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let result;
    try {
      result = await build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [lego({ blocksDir: './src' })],
        resolve: { alias: [{ find: /^lego-dom$/, replacement: path.join(repo, 'src/index.js') }] },
        build: {
          write: false,
          minify: false,
          lib: { entry: path.join(dir, 'src/app.js'), formats: ['iife'], name: 'App', fileName: 'app' }
        }
      });
    } finally {
      log.mockRestore();
    }
    const code = (Array.isArray(result) ? result[0] : result).output[0].code;

    const dom = new JSDOM('<!DOCTYPE html><body><price-tag></price-tag><ts-tag></ts-tag><own-lego></own-lego>' +
      '<implicit-tag></implicit-tag><legacy-tag></legacy-tag></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
    const w = dom.window;
    w.CSSStyleSheet = class { constructor() { this.cssRules = []; } replace() { return Promise.resolve(this); } replaceSync() {} };
    w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    w.eval(code);
    await w.__app.init();
    await flush(50);

    const text = (tag) => w.document.querySelector(tag).shadowRoot.textContent.trim();
    expect(text('price-tag')).toBe('$12.00');
    expect(text('ts-tag')).toBe('$5.00');
    expect(text('own-lego')).toBe('function:mine');
    expect(text('implicit-tag')).toBe('function:function');
    expect(text('legacy-tag')).toBe('7');
  }, 30000);
});
