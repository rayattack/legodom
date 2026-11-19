/**
 * The studio's programmatic entry point.
 *
 * `startDevServer` is re-exported from a module that imports Vite lazily, so
 * importing this file in a project without Vite installed is safe.
 */

export { startDevServer, STUDIO_ROOT, PACKAGE_ROOT, FRAMEWORK_ENTRY } from './dev/server.js';
export { main, USAGE } from './cli/index.js';
export { parseFlags } from './cli/flags.js';
export {
  studioVirtuals,
  MANIFEST_ID,
  BLOCKS_ID,
  manifestModule,
  blocksModule
} from './dev/virtual.js';
