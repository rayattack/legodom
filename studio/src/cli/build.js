/**
 * `lego-studio build`: the studio as a folder of files.
 *
 * A studio that only exists while a dev server is running cannot be linked to
 * in a pull request, and a review comment that says "run this command and
 * click around" is a review comment nobody acts on. So the output here is a
 * plain static site: the same two HTML entries and the same plugins the dev
 * server assembles, with the manifest inlined by the virtual modules rather
 * than fetched, so nothing in it needs a process behind it.
 *
 * The one thing that would have needed a process is the hydration panel's
 * server half, which the dev server answers from a middleware. Every story is
 * pre-rendered here instead and written out as JSON the panel can fetch off
 * the same static host, which keeps the panel working in the built output
 * rather than quietly turning into an error message.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { studioVirtuals } from '../dev/virtual.js';
import { hydrationSSR, renderAllStories, SSR_STATIC_DIR } from '../hydrate/plugin.js';
import { STUDIO_ROOT, FRAMEWORK_ENTRY } from '../dev/server.js';

const DEFAULT_OUT = 'dist-studio';

/**
 * The manager is at `manager/index.html` in the output, because that is where
 * it sits in the source tree and a static host has no rewrite to hide it. A
 * root document that forwards is the whole of what the dev server's URL
 * rewriting was doing, minus the server.
 */
const ROOT_REDIRECT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Lego Studio</title>
    <meta http-equiv="refresh" content="0; url=./manager/">
    <link rel="canonical" href="./manager/">
  </head>
  <body>
    <p>Opening <a href="./manager/">Lego Studio</a>.</p>
  </body>
</html>
`;

/** Total bytes on disk under `dir`, and how many files that is. */
const measure = async (dir) => {
  let bytes = 0;
  let files = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await measure(full);
      bytes += nested.bytes;
      files += nested.files;
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs.stat(full);
    bytes += stat.size;
    files++;
  }
  return { bytes, files };
};

const human = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * Write one JSON file per story, named by story id.
 *
 * A file per story rather than one map, because the panel wants one story and
 * a static host cannot slice a map. The ids are `block--slug`, which is
 * already safe as a filename on every platform the studio runs on.
 *
 * @param {string} outDir
 * @param {object} manifest
 * @returns {Promise<number>} how many stories were written
 */
export async function writeStaticSSR(outDir, manifest) {
  const dir = path.join(outDir, ...SSR_STATIC_DIR.split('/'));
  await fs.mkdir(dir, { recursive: true });
  const rendered = renderAllStories(manifest);
  const ids = Object.keys(rendered);
  for (const id of ids) {
    await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(rendered[id]), 'utf8');
  }
  return ids.length;
}

/**
 * @param {object} flags
 * @param {string} [flags.root] - the project directory holding .lego files
 * @param {string} [flags.out] - where to write, defaults to ./dist-studio
 * @param {string[]} [flags.include]
 * @param {string[]} [flags.exclude]
 * @returns {Promise<number>} the process exit code
 */
export async function run(flags = {}) {
  const projectRoot = path.resolve(flags.root || process.cwd());
  const outDir = path.resolve(String(flags.out || DEFAULT_OUT));

  let build;
  let legoPlugin;
  try {
    ({ build } = await import('vite'));
    ({ default: legoPlugin } = await import('../../../vite-plugin.js'));
  } catch (err) {
    console.error(
      '[lego-studio] Vite is required to build the studio. Install it with `npm i -D vite`.' +
      `\n  ${err && err.message ? err.message : err}`
    );
    return 1;
  }

  const includeGlobs = flags.include && flags.include.length ? flags.include : ['**/*.lego'];
  // Held in a variable rather than built inline, because the manifest it
  // computes is needed again after the build to pre-render the stories, and
  // discovering twice could produce two different answers.
  const virtuals = studioVirtuals({ root: projectRoot, include: includeGlobs, exclude: flags.exclude });

  await build({
    configFile: false,
    envDir: false,
    root: STUDIO_ROOT,
    // Relative, because the output has to work wherever it is dropped: a
    // subdirectory of a docs site, an artifact viewer, a local folder.
    base: './',
    logLevel: 'warn',
    clearScreen: false,
    resolve: {
      alias: [{ find: /^lego-dom$/, replacement: FRAMEWORK_ENTRY }]
    },
    build: {
      outDir,
      // outDir is normally outside the Vite root here, and Vite will not
      // clear such a directory unless it is told to in as many words.
      emptyOutDir: true,
      rollupOptions: {
        input: {
          manager: path.join(STUDIO_ROOT, 'manager', 'index.html'),
          preview: path.join(STUDIO_ROOT, 'preview', 'index.html')
        }
      }
    },
    plugins: [
      virtuals,
      // Carried over from the dev server so the plugin list stays one list.
      // It installs no middleware during a build, which is the point: the
      // route it would have served is written out below instead.
      hydrationSSR(),
      legoPlugin({ blocksDir: projectRoot, include: includeGlobs, importPath: 'lego-dom' })
    ]
  });

  const manifest = await virtuals.api.manifest();
  const stories = await writeStaticSSR(outDir, manifest);
  await fs.writeFile(path.join(outDir, 'index.html'), ROOT_REDIRECT, 'utf8');

  manifest.errors.forEach((message) => console.error(message));

  const { bytes, files } = await measure(outDir);
  console.log(`${outDir}`);
  console.log(
    `${files} files, ${human(bytes)}, ` +
    `${manifest.order.length} blocks, ${stories} pre-rendered stories`
  );

  return manifest.errors.length === 0 ? 0 : 1;
}

export default run;
