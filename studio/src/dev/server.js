/**
 * The studio dev server.
 *
 * Vite is started programmatically with the studio's own `src` as the root, so
 * `manager/index.html` and `preview/index.html` resolve as ordinary entries and
 * the studio's modules are served from source with no build step. The user's
 * project is a config value, not the root: their `.lego` files are read through
 * `server.fs.allow` and transformed by the repo's own vite plugin.
 *
 * Vite and the repo's own .lego plugin (which reaches for esbuild) are both
 * imported inside the function. That keeps `studio/src/index.js` importable in
 * a project that only wants the CLI's other subcommands.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { studioVirtuals } from './virtual.js';
import { hydrationSSR } from '../hydrate/plugin.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** studio/src, the Vite root. Both HTML entries live under it. */
export const STUDIO_ROOT = path.resolve(here, '..');

/** The lego-dom checkout the studio ships inside. */
export const PACKAGE_ROOT = path.resolve(here, '../../..');

/**
 * `import { Lego } from 'lego-dom'` in the preview, in the manager and in every
 * transformed .lego file resolves to the framework's source entry. Nothing is
 * built and nothing is pre-bundled: the file is inside the same checkout, so
 * Vite serves it like any other source module and it sets `window.Lego` on
 * evaluation exactly as the published build does.
 */
export const FRAMEWORK_ENTRY = path.join(PACKAGE_ROOT, 'src', 'index.js');

const DEFAULT_PORT = 6006;

const MANAGER_HTML = '/manager/index.html';
const PREVIEW_HTML = '/preview/index.html';

/**
 * Two entries, two friendly URLs. The rewrite is installed from
 * `configureServer`, which Vite runs before it mounts its own transform,
 * static and html middlewares, so the rewritten path is what they all see.
 *
 * The browser's address bar keeps saying `/preview`, so the preview document
 * must reference its script by an absolute path rather than a relative one.
 */
const entryRewrite = () => ({
  name: 'lego-studio:entries',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const raw = req.url || '/';
      const q = raw.indexOf('?');
      const pathname = q === -1 ? raw : raw.slice(0, q);
      const search = q === -1 ? '' : raw.slice(q);

      if (pathname === '/' || pathname === '/index.html') {
        req.url = MANAGER_HTML + search;
      } else if (pathname === '/preview' || pathname === '/preview/' || pathname === '/preview.html') {
        req.url = PREVIEW_HTML + search;
      }
      next();
    });
  }
});

const existing = (...candidates) => candidates.filter((file) => fs.existsSync(file));

/**
 * @param {object} [options]
 * @param {string} [options.root] - the project directory holding .lego files
 * @param {number} [options.port]
 * @param {boolean} [options.open]
 * @param {string[]} [options.include]
 * @param {string[]} [options.exclude]
 * @returns {Promise<{server: import('vite').ViteDevServer, url: string, close: () => Promise<void>}>}
 */
export async function startDevServer(options = {}) {
  const {
    root = process.cwd(),
    port = DEFAULT_PORT,
    open = false,
    include,
    exclude
  } = options;

  let createServer;
  let legoPlugin;
  try {
    ({ createServer } = await import('vite'));
    ({ default: legoPlugin } = await import('../../../vite-plugin.js'));
  } catch (err) {
    throw new Error(
      '[lego-studio] Vite is required to run the studio dev server. Install it with `npm i -D vite`.' +
      `\n  ${err && err.message ? err.message : err}`
    );
  }

  const projectRoot = path.resolve(root);
  const includeGlobs = include && include.length ? include : ['**/*.lego'];

  const entries = existing(
    path.join(STUDIO_ROOT, 'manager', 'index.html'),
    path.join(STUDIO_ROOT, 'preview', 'index.html')
  );

  const server = await createServer({
    configFile: false,
    envDir: false,
    root: STUDIO_ROOT,
    // Two hand-written HTML entries, no SPA fallback: a URL that names nothing
    // should 404 rather than quietly serve the manager.
    appType: 'mpa',
    logLevel: 'info',
    clearScreen: false,
    server: {
      port,
      open: open ? '/' : false,
      fs: {
        // The framework source and the user's blocks both live outside the
        // Vite root, so they have to be allowed explicitly.
        allow: Array.from(new Set([STUDIO_ROOT, PACKAGE_ROOT, projectRoot]))
      }
    },
    resolve: {
      alias: [{ find: /^lego-dom$/, replacement: FRAMEWORK_ENTRY }]
    },
    optimizeDeps: entries.length ? { entries } : undefined,
    plugins: [
      entryRewrite(),
      studioVirtuals({ root: projectRoot, include: includeGlobs, exclude }),
      // Renders a story in Node, from the manifest studioVirtuals is already
      // serving, so the hydration panel compares two renderings of the same
      // definitions rather than of two separate scans.
      hydrationSSR(),
      // blocksDir is absolute, so path.resolve inside the plugin returns it
      // unchanged and the scan happens in the user's project, not in ours.
      legoPlugin({ blocksDir: projectRoot, include: includeGlobs, importPath: 'lego-dom' })
    ]
  });

  await server.listen();

  const resolved = server.resolvedUrls;
  const url = (resolved && (resolved.local[0] || resolved.network[0])) || `http://localhost:${port}/`;

  return {
    server,
    url,
    close: () => server.close()
  };
}

export default startDevServer;
