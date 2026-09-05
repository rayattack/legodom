/**
 * Vite plugin for Lego Single File Blocks
 * Auto-discovers and transforms .lego files
 */

import { parseLego, generateBlockCall, validateLego } from './src/utils/parser-utils.js';
import { globToRegExp } from './src/utils/glob.js';
import path from 'path';
import fs from 'fs';
import { transform } from 'esbuild';

const VIRTUAL_MODULE_ID = 'virtual:lego-blocks';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/**
 * Vite plugin for Lego SFC support
 * @param {object} options - Plugin options
 * @param {string} options.blocksDir - Directory to search for .lego files
 * @param {string[]} options.include - Glob patterns to include
 * @returns {import('vite').Plugin}
 */
export default function legoPlugin(options = {}) {
  const {
    blocksDir = './src',
    include = ['**/*.lego'],
    importPath = 'lego-dom'
  } = options;

  let config;
  let legoFiles = [];
  let server;

  const getSearchPath = () => {
    const root = config?.root || process.cwd();
    return path.resolve(root, blocksDir);
  };

  // Replaces fast-glob so the published package keeps zero runtime
  // dependencies. `include` is matched against paths relative to the search
  // root, using forward slashes on every platform.
  const patterns = (Array.isArray(include) ? include : [include]).map(globToRegExp);

  const scanFiles = async () => {
    const searchPath = getSearchPath();
    try {
      const entries = await fs.promises.readdir(searchPath, {
        recursive: true,
        withFileTypes: true
      });

      legoFiles = entries
        .filter(entry => entry.isFile())
        // Dirent.parentPath is Node 21+; .path is the Node 20 spelling.
        .map(entry => path.join(entry.parentPath || entry.path, entry.name))
        .filter(absolute => {
          const relative = path.relative(searchPath, absolute).split(path.sep).join('/');
          return patterns.some(re => re.test(relative));
        })
        .sort();

      return legoFiles;
    } catch (err) {
      console.warn(`[vite-plugin-lego] Could not scan for .lego files in ${searchPath}:`, err.message);
      legoFiles = [];
      return [];
    }
  };

  const invalidateVirtualModule = () => {
    if (!server) return;
    const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
    if (module) {
      server.moduleGraph.invalidateModule(module);
      server.ws.send({
        type: 'custom',
        event: 'lego:blocks-changed'
      });
    }
  };

  return {
    name: 'vite-plugin-lego',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    configureServer(_server) {
      server = _server;
      const searchPath = getSearchPath();

      // Watch for new or deleted .lego files
      server.watcher.add(searchPath);
      server.watcher.on('add', (file) => {
        if (file.endsWith('.lego')) {
          console.log(`[vite-plugin-lego] New block detected: ${path.basename(file)}`);
          scanFiles().then(invalidateVirtualModule);
        }
      });
      server.watcher.on('unlink', (file) => {
        if (file.endsWith('.lego')) {
          console.log(`[vite-plugin-lego] Block removed: ${path.basename(file)}`);
          scanFiles().then(invalidateVirtualModule);
        }
      });
    },

    async buildStart() {
      await scanFiles();
      if (legoFiles.length > 0) {
        console.log(`[vite-plugin-lego] Discovered ${legoFiles.length} block(s):`);
        legoFiles.forEach(file => {
          const name = path.basename(file);
          console.log(`  - ${name}`);
        });
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    async load(id) {
      // Handle virtual module that imports all .lego blocks
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const imports = legoFiles.map((file, index) =>
          `import block${index} from '${file}?lego-block';`
        ).join('\n');

        const exports = `export default function registerBlocks() {\n  // Blocks are auto-registered when imported\n}`;

        const hmrListener = `
if (import.meta.hot) {
  import.meta.hot.on('lego:blocks-changed', () => {
    import.meta.hot.invalidate();
  });
}`;

        return `${imports}\n\n${exports}\n${hmrListener}`;
      }

      // Handle individual .lego files
      if (id.endsWith('.lego') || id.includes('.lego?')) {
        const filePath = id.split('?')[0];
        const content = fs.readFileSync(filePath, 'utf-8');

        // [FIX] Return empty module for empty files to prevent validation error
        if (!content.trim()) return 'export default "";';

        const filename = path.basename(filePath);

        const parsed = parseLego(content, filename);
        const validation = validateLego(parsed);

        if (!validation.valid) {
          throw new Error(`Invalid .lego file "${filename}":\n${validation.errors.join('\n')}`);
        }

        // TypeScript Support
        if (parsed.script && parsed.scriptLang === 'ts') {
          try {
            const result = await transform(parsed.script, {
              loader: 'ts',
              format: 'esm'
            });
            parsed.script = result.code;
          } catch (e) {
            throw new Error(`TypeScript compilation failed for ${filename}: ${e.message}`);
          }
        }

        const blockCall = generateBlockCall(parsed);

        return `
import { Lego } from '${importPath}';
const $db = Lego.db;

${blockCall}

export default '${parsed.blockName}';

// HMR Code Injected
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // The new module will re-run 'Lego.block(...)' to register the update.
    // LegoDOM's index.js will handle the live re-render.
  });
}
`;
      }
    }
  };
}
