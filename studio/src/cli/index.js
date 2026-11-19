/**
 * `lego-studio` subcommand dispatch.
 *
 * Every subcommand lives in its own module exporting `run(flags)` and returning
 * an exit code. They are pulled in with a dynamic import rather than a static
 * one for two reasons: a subcommand nobody typed should not cost its import
 * graph (the dev server drags in Vite), and a module that has not been written
 * yet should report itself as unavailable instead of taking the whole CLI down
 * at load time.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags } from './flags.js';

const COMMANDS = {
  dev: './dev.js',
  snap: './snap.js',
  graph: './graph.js',
  build: './build.js',
  hydrate: './hydrate.js'
};

const USAGE = `
lego-studio - a studio for LegoDOM blocks

Usage
  lego-studio [command] [options]

Commands
  dev            Start the studio dev server (default)
  snap           Render every story to HTML and compare against snapshots
  graph          Print the block dependency graph
  build          Build a static studio bundle
  hydrate        Check the server render against the hydration contract

Options
  --root <dir>       Project directory to scan for .lego files (default: cwd)
  --include <glob>   Glob of blocks to include, repeatable (default: **/*.lego)
  --exclude <glob>   Glob to skip, repeatable
  --out <dir>        Where build writes (default: dist-studio)
  --only a,b         Restrict snap and hydrate to these block tags
  --affected         Restrict snap and graph to blocks a git diff can reach
  --base <ref>       What --affected diffs against (default: origin/main)
  -p, --port <n>     Dev server port (default: 6006)
  --open             Open a browser on start
  -h, --help         Print this message

Examples
  lego-studio
  lego-studio dev --root ./src -p 4321
  lego-studio snap --update
  lego-studio snap --check --affected --base origin/main
  lego-studio hydrate --check
  lego-studio build --out dist-studio
`.trim();

/**
 * A subcommand module that does not exist yet is a normal state during
 * development, and it has to be told apart from a module that exists but
 * failed to resolve one of its own imports. Node names the missing specifier
 * in the message, so the file path is the thing to look for.
 */
const isMissingModule = (err, absolutePath) => {
  if (!err || (err.code !== 'ERR_MODULE_NOT_FOUND' && err.code !== 'MODULE_NOT_FOUND')) return false;
  const message = String(err.message || '');
  return message.includes(absolutePath) || message.includes(absolutePath.replace(/\\/g, '/'));
};

const here = path.dirname(fileURLToPath(import.meta.url));

const loadCommand = async (name) => {
  const specifier = COMMANDS[name];
  const absolutePath = path.join(here, specifier.slice(2));
  try {
    return await import(specifier);
  } catch (err) {
    if (isMissingModule(err, absolutePath)) {
      console.error(`[lego-studio] "${name}" is not available yet (missing ${path.relative(process.cwd(), absolutePath)}).`);
      return null;
    }
    throw err;
  }
};

/**
 * Fill in the flags every subcommand agrees on, so no `run()` has to repeat
 * the same defaulting. `include` and `exclude` are normalised to arrays
 * because `parseFlags` only builds one when the flag was actually repeated.
 */
const withDefaults = (flags) => {
  const list = (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);
  return {
    ...flags,
    root: path.resolve(String(flags.root || process.cwd())),
    include: list(flags.include),
    exclude: list(flags.exclude)
  };
};

/**
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv = []) {
  const first = argv[0];
  const wantsHelp = first === '--help' || first === '-h' || argv.includes('--help');

  if (wantsHelp) {
    console.log(USAGE);
    return 0;
  }

  const named = typeof first === 'string' && !first.startsWith('-') ? first : null;

  if (named && !COMMANDS[named]) {
    console.error(`[lego-studio] Unknown command "${named}".\n`);
    console.error(USAGE);
    return 1;
  }

  const command = named || 'dev';
  const flags = withDefaults(parseFlags(named ? argv.slice(1) : argv));

  const mod = await loadCommand(command);
  if (!mod) return 1;

  if (typeof mod.run !== 'function') {
    console.error(`[lego-studio] "${command}" does not export run(flags).`);
    return 1;
  }

  const code = await mod.run(flags);
  return typeof code === 'number' ? code : 0;
}

export { USAGE, COMMANDS };
export default main;
