/**
 * Vite plugin for Lego Single File Components
 * Auto-discovers and transforms .lego files
 */

import { parseLego, generateDefineCall, validateLego } from './parse-lego.js';
import path from 'path';
import fg from 'fast-glob';

const VIRTUAL_MODULE_ID = 'virtual:lego-components';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/**
 * Vite plugin for Lego SFC support
 * @param {object} options - Plugin options
 * @param {string} options.componentsDir - Directory to search for .lego files
 * @param {string[]} options.include - Glob patterns to include
 * @returns {import('vite').Plugin}
 */
export default function legoPlugin(options = {}) {
  const {
    componentsDir = './src/components',
    include = ['**/*.lego']
  } = options;

  let config;
  let legoFiles = [];
  let server;

  const getSearchPath = () => {
    const root = config?.root || process.cwd();
    return path.resolve(root, componentsDir);
  };

  const scanFiles = async () => {
    const searchPath = getSearchPath();
    try {
      legoFiles = await fg(include, {
        cwd: searchPath,
        absolute: true
      });
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
        type: 'full-reload',
        path: '*'
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
          console.log(`[vite-plugin-lego] New component detected: ${path.basename(file)}`);
          scanFiles().then(invalidateVirtualModule);
        }
      });
      server.watcher.on('unlink', (file) => {
        if (file.endsWith('.lego')) {
          console.log(`[vite-plugin-lego] Component removed: ${path.basename(file)}`);
          scanFiles().then(invalidateVirtualModule);
        }
      });
    },

    async buildStart() {
      await scanFiles();
      if (legoFiles.length > 0) {
        console.log(`[vite-plugin-lego] Discovered ${legoFiles.length} component(s):`);
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
      // Handle virtual module that imports all .lego components
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const imports = legoFiles.map((file, index) =>
          `import component${index} from '${file}?lego-component';`
        ).join('\n');

        const exports = `export default function registerComponents() {\n  // Components are auto-registered when imported\n}`;

        return `${imports}\n\n${exports}`;
      }

      // Handle individual .lego files
      if (id.endsWith('.lego') || id.includes('.lego?')) {
        const filePath = id.split('?')[0];
        const fs = await import('fs');
        const content = fs.readFileSync(filePath, 'utf-8');
        const filename = path.basename(filePath);

        const parsed = parseLego(content, filename);
        const validation = validateLego(parsed);

        if (!validation.valid) {
          throw new Error(`Invalid .lego file "${filename}":\n${validation.errors.join('\n')}`);
        }

        const defineCall = generateDefineCall(parsed);

        return `
import { Lego } from 'lego-dom/main.js';

${defineCall}

export default '${parsed.componentName}';
`;
      }
    },

    handleHotUpdate({ file, server }) {
      if (file.endsWith('.lego')) {
        console.log(`[vite-plugin-lego] Hot reload: ${path.basename(file)}`);
        // Trigger full reload for component content changes
        server.ws.send({
          type: 'full-reload',
          path: '*'
        });
      }
    },

    transform(code, id) {
      if (id.endsWith('.lego') && !id.includes('?')) {
        const parsed = parseLego(code, path.basename(id));
        const validation = validateLego(parsed);

        if (!validation.valid) {
          throw new Error(`Invalid .lego file:\n${validation.errors.join('\n')}`);
        }

        return {
          code: generateDefineCall(parsed),
          map: null
        };
      }
    }
  };
}
