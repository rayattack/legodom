/**
 * The two virtual modules the preview boots from.
 *
 *   virtual:lego-studio/manifest  default-exports the Manifest as JSON
 *   virtual:lego-studio/blocks    imports every discovered .lego file
 *
 * They are separate on purpose. The manifest is data the manager and the
 * preview both read; the blocks module is a side effect, one import per file,
 * emitted in `manifest.order` so two runs of the studio register blocks in the
 * same sequence and a tag collision always reports the same winner.
 *
 * Everything below the plugin factory is pure string building, which is what
 * the tests exercise. The plugin itself only adds Vite's module graph and the
 * file watcher on top.
 */

import path from 'node:path';
import { PROTOCOL } from '../core/contracts.js';

export const MANIFEST_ID = 'virtual:lego-studio/manifest';
export const BLOCKS_ID = 'virtual:lego-studio/blocks';

// Vite's convention: a resolved virtual id starts with a NUL so no other
// plugin and no filesystem lookup mistakes it for a real path.
export const RESOLVED_MANIFEST_ID = '\0' + MANIFEST_ID;
export const RESOLVED_BLOCKS_ID = '\0' + BLOCKS_ID;

const RESOLVE_MAP = {
  [MANIFEST_ID]: RESOLVED_MANIFEST_ID,
  [BLOCKS_ID]: RESOLVED_BLOCKS_ID
};

/**
 * Map a bare specifier onto its resolved id, or null when it is not ours.
 * Vite also hands ids through with a `/@id/` prefix already stripped, so the
 * resolved form is accepted back as itself.
 *
 * @param {string} id
 * @returns {?string}
 */
export const resolveVirtualId = (id) => {
  if (typeof id !== 'string') return null;
  if (id === RESOLVED_MANIFEST_ID || id === RESOLVED_BLOCKS_ID) return id;
  return RESOLVE_MAP[id] || null;
};

/** An empty manifest, used before discovery has run and when it cannot. */
export const emptyManifest = (root = '', errors = []) => ({
  root,
  blocks: {},
  order: [],
  errors
});

/**
 * The manifest module source. JSON.stringify rather than a literal so nothing
 * in a block's markup can escape into the module body.
 *
 * @param {object} manifest
 * @returns {string}
 */
export const manifestModule = (manifest) =>
  `export default ${JSON.stringify(manifest || emptyManifest(), null, 2)};\n`;

// Windows paths reach Vite as module specifiers, where a backslash is an
// escape rather than a separator.
const toSpecifier = (file) => String(file).split(path.win32.sep).join('/');

/**
 * The blocks module source: one side-effect import per discovered file, in
 * `manifest.order`. The `?lego-block` query matches what the repo's own
 * vite-plugin emits, so the same load hook handles both entry points.
 *
 * @param {object} manifest
 * @returns {string}
 */
export const blocksModule = (manifest) => {
  const blocks = (manifest && manifest.blocks) || {};
  const order = Array.isArray(manifest && manifest.order) ? manifest.order : Object.keys(blocks);

  const seen = new Set();
  const lines = [];
  for (const tag of order) {
    const file = blocks[tag] && blocks[tag].file;
    if (!file || seen.has(file)) continue;
    seen.add(file);
    lines.push(`import ${JSON.stringify(`${toSpecifier(file)}?lego-block`)};`);
  }

  // A no-op export keeps the module a module even when nothing was found, and
  // gives the preview something to await other than a bare side effect.
  return `${lines.join('\n')}${lines.length ? '\n\n' : ''}export const count = ${lines.length};\n`;
};

/**
 * Load `discover()` lazily so a studio checkout without it still starts. The
 * dev server is more useful reporting an empty manifest in the browser than
 * refusing to boot at all.
 */
const loadDiscover = async () => {
  try {
    const mod = await import('../core/discover.js');
    if (typeof mod.discover === 'function') return mod.discover;
    return null;
  } catch {
    return null;
  }
};

const isLegoFile = (file) => typeof file === 'string' && file.endsWith('.lego');

/**
 * @param {object} options
 * @param {string} options.root - the user's project directory
 * @param {string[]} [options.include]
 * @param {string[]} [options.exclude]
 * @param {Function} [options.discover] - injected for tests
 * @returns {import('vite').Plugin}
 */
export function studioVirtuals(options = {}) {
  const { root, include, exclude } = options;

  let server = null;
  let manifest = null;
  let inFlight = null;
  let warnedMissing = false;

  const compute = async () => {
    const discover = options.discover || (await loadDiscover());
    if (!discover) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn('[lego-studio] core/discover.js is not available yet; serving an empty manifest.');
      }
      return emptyManifest(root, ['discover() is not available yet']);
    }
    try {
      const result = await discover({ root, include, exclude });
      return result || emptyManifest(root);
    } catch (err) {
      console.error('[lego-studio] discover() failed:', err && err.message ? err.message : err);
      return emptyManifest(root, [String(err && err.message ? err.message : err)]);
    }
  };

  const ensure = () => {
    if (manifest) return Promise.resolve(manifest);
    if (!inFlight) {
      inFlight = compute().then((result) => {
        manifest = result;
        inFlight = null;
        return result;
      });
    }
    return inFlight;
  };

  /**
   * Re-run discovery, drop both modules out of the graph and tell the preview.
   * The custom event is what lets the preview re-read the manifest without a
   * full page reload, which is the difference between keeping the mounted
   * story's scroll position and losing it.
   */
  const invalidate = async () => {
    manifest = null;
    inFlight = null;
    await ensure();
    if (!server) return;
    for (const id of [RESOLVED_MANIFEST_ID, RESOLVED_BLOCKS_ID]) {
      const mod = server.moduleGraph.getModuleById(id);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
    server.ws.send({ type: 'custom', event: PROTOCOL.INVALIDATE });
  };

  return {
    name: 'lego-studio:virtual',
    enforce: 'pre',

    configureServer(_server) {
      server = _server;
      // The user's project sits outside the studio's Vite root, so its tree is
      // not watched by default.
      if (root) server.watcher.add(root);

      const onChange = (file) => {
        if (!isLegoFile(file)) return;
        invalidate().catch((err) => console.error('[lego-studio]', err));
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
      server.watcher.on('change', onChange);
    },

    resolveId(id) {
      return resolveVirtualId(id);
    },

    async load(id) {
      if (id === RESOLVED_MANIFEST_ID) return manifestModule(await ensure());
      if (id === RESOLVED_BLOCKS_ID) return blocksModule(await ensure());
      return null;
    },

    // Exposed for the dev server and for tests that want to drive the plugin
    // without a running Vite instance.
    api: {
      manifest: ensure,
      invalidate
    }
  };
}

export default studioVirtuals;
