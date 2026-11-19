/**
 * Story rendering, in Node.
 *
 * A story is only interesting once it is markup, and the markup a story
 * produces has to be the markup the browser would have produced, or the
 * snapshot it lands in proves nothing. So this module renders through
 * `lego-dom/server` rather than reimplementing the template language: the
 * server renderer already walks the same directives, through the same
 * `compile()`, in the same resolution order as the client.
 *
 * One renderer serves the whole manifest. Blocks compose, so a block can only
 * be rendered if every block it names is registered on the same renderer, and
 * building a fresh renderer per story would leave every nested tag unresolved.
 *
 * Imports reach into `src/` by relative path on purpose. The studio runs from
 * the repo without a build step, and `lego-dom/server` resolves to `dist/`.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRenderer } from '../../../src/server/index.js';
import { scriptFunctionBody, scriptHasImports } from '../../../src/utils/parser-utils.js';
import {
  parseHTML,
  serialize,
  serializeAttrs,
  RAW_TEXT_ELEMENTS,
  VOID_ELEMENTS
} from '../../../src/server/html.js';

/** Lifecycle hooks the studio never calls, so they are never state or method. */
export const LIFECYCLE_KEYS = ['mounted', 'unmounted', 'beforeUpdate', 'updated', 'errorCaptured'];

/**
 * What a script section sees as `$db`. Persistence is a browser concern, so
 * the studio hands the block an object that answers and stores nothing: a
 * block whose logic reads a persisted value still evaluates.
 */
const inertDb = () => ({ get: () => null, set: () => {}, clear: () => {} });

/**
 * What a script section sees as `Lego`. The browser passes the real app here,
 * and a block that calls into it at definition time (registering a route, say)
 * would otherwise throw before the studio ever saw its logic.
 */
const inertApp = {
  config: {},
  globals: {},
  block: () => inertApp,
  route: () => inertApp,
  use: () => inertApp
};

/** What a bundled script gets for `import … from 'lego-dom'`. */
const inertModule = { __esModule: true, Lego: inertApp, default: inertApp, createApp: () => inertApp };

/**
 * Logic that loadLogic() evaluated by bundling, by file. The script text is
 * kept beside it so an edited block is never answered from a stale entry.
 */
const bundled = new Map();

const asLogic = (value) => (value && typeof value === 'object' ? value : {});

/**
 * Evaluate the `<script>` section of a block and hand back its logic object.
 *
 * This is the one place the studio compiles source text, and it mirrors what
 * `defineLegoFile` does in src/core/parser.js. Template expressions never take
 * this path: they go through `compile()` in expression.js, which builds
 * closures and never calls `new Function`.
 *
 * A script that imports modules, or is TypeScript, cannot run as plain code.
 * discover() evaluates those through loadLogic() and this returns what it
 * found, so the synchronous story renderer sees the same logic.
 *
 * Failure is a value, not an exception. Discovery has to survive one broken
 * block, so the caller records the message and carries on with empty logic.
 *
 * @param {string} script - the raw script section
 * @param {string} blockName - tag name, for the error message
 * @param {string} [file] - the block's file, for logic loadLogic() bundled
 * @returns {{logic: object, error: ?string}}
 */
export const evaluateLogic = (script, blockName, file) => {
  if (!script || !script.trim()) return { logic: {}, error: null };
  const hit = file && bundled.get(file);
  if (hit && hit.script === script) return hit.result;
  try {
    const logic = new Function('Lego', '$db', scriptFunctionBody(script))(inertApp, inertDb);
    return { logic: asLogic(logic), error: null };
  } catch (err) {
    return { logic: {}, error: `<${blockName}>: script section did not evaluate: ${err.message}` };
  }
};

/**
 * Bundle a script section with esbuild and evaluate the result: relative
 * imports are inlined, package imports are required from the block's own
 * directory, and `lego-dom` is the studio's inert app. esbuild is resolved
 * from the project, where Vite brings it.
 */
const bundleLogic = async (script, blockName, file, lang) => {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    return {
      logic: {},
      error: `<${blockName}>: script section imports modules or is TypeScript, and evaluating it needs esbuild (installed with Vite)`
    };
  }
  try {
    const out = await esbuild.build({
      stdin: {
        contents: script,
        resolveDir: path.dirname(file),
        sourcefile: file,
        loader: lang === 'ts' ? 'ts' : 'js'
      },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      packages: 'external',
      logLevel: 'silent'
    });
    const fromProject = createRequire(file);
    const require = (id) => (id === 'lego-dom' ? inertModule : fromProject(id));
    const module = { exports: {} };
    // `Lego` and `$db` sit one scope out, so a script declaring either itself
    // shadows them rather than colliding.
    new Function('Lego', '$db', `return function (require, module, exports) {\n${out.outputFiles[0].text}\n};`)(
      inertApp,
      inertDb
    )(require, module, module.exports);
    return { logic: asLogic(module.exports && module.exports.default), error: null };
  } catch (err) {
    return { logic: {}, error: `<${blockName}>: script section did not evaluate: ${err.message}` };
  }
};

/**
 * evaluateLogic() for discovery: the same answer for a self-contained script,
 * and a bundled evaluation for one that imports modules or is TypeScript.
 * Always re-bundles, so an edit to an imported helper is picked up on the
 * next discovery.
 *
 * @param {string} script - the raw script section
 * @param {{blockName: string, file: string, lang?: string}} where
 * @returns {Promise<{logic: object, error: ?string}>}
 */
export async function loadLogic(script, { blockName, file, lang } = {}) {
  if (!script || !script.trim()) return { logic: {}, error: null };
  if (!file || (lang !== 'ts' && !scriptHasImports(script))) return evaluateLogic(script, blockName, file);
  const result = await bundleLogic(script, blockName, file, lang);
  bundled.set(file, { script, result });
  return result;
}

/**
 * Translate a story's slot map into the shape `renderToString` takes.
 *
 * A Story names the default slot `''`, because that is what a `<slot>` with no
 * name answers to; the server renderer names it `default`, because that key
 * has to survive being written in JavaScript. Anything else would be stamped
 * onto the fragment as `slot=""` and land nowhere.
 *
 * Named keys are sorted so two stories carrying the same slots in a different
 * authoring order still render byte identical markup.
 */
const toRendererSlots = (slots) => {
  if (!slots) return {};
  const out = {};
  const fallback = typeof slots[''] === 'string' ? slots[''] : slots.default;
  if (typeof fallback === 'string' && fallback !== '') out.default = fallback;
  Object.keys(slots).sort().forEach((name) => {
    if (name === '' || name === 'default') return;
    const html = slots[name];
    if (typeof html === 'string' && html !== '') out[name] = html;
  });
  return out;
};

/**
 * Build the renderer for one manifest and a `render(story)` bound to it.
 *
 * Registration follows `manifest.order`, which is sorted, so the renderer's
 * definition map is built in the same sequence on every run.
 *
 * A block whose script will not evaluate is still registered, with empty
 * logic, because its template may be all a story needs. The message joins
 * `manifest.errors`, and only once: discovery has usually recorded it already.
 *
 * @param {object} manifest - what discover() returned
 * @returns {{render: (story: object) => string, renderer: object}}
 */
export function createStoryRenderer(manifest) {
  const renderer = createRenderer();
  const errors = Array.isArray(manifest.errors) ? manifest.errors : [];

  manifest.order.forEach((tag) => {
    const block = manifest.blocks[tag];
    if (!block) return;
    const { logic, error } = evaluateLogic(block.script, tag, block.file);
    // Discovery records the same message prefixed with the block's file.
    if (error && !errors.some(e => e === error || e.endsWith(`: ${error}`))) errors.push(error);
    renderer.define(tag, {
      template: block.template,
      logic,
      styles: block.css,
      shadow: block.shadow !== false,
      // The raw declaration rather than the parsed names: the server shares
      // the client's `parseProps`, so handing it the source text is what gets
      // types and per-render defaults applied the way a mount would apply
      // them. A name list would carry neither.
      props: block.propsAttr
    });
  });

  const render = (story) => renderer.renderToString(story.block, {
    props: story.args || {},
    globals: story.globals || {},
    route: story.route || null,
    slots: toRendererSlots(story.slots)
  });

  return { render, renderer };
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const INDENT = '  ';

/**
 * Whether an element's content has to survive verbatim. Breaking a line
 * inside `<style>` or `<textarea>` changes what the element means, and a void
 * element has no content to break in the first place.
 */
const isOpaque = (node) => RAW_TEXT_ELEMENTS.has(node.tag);

const formatNodes = (nodes, depth, out) => {
  const pad = INDENT.repeat(depth);
  nodes.forEach((node) => {
    if (node.type === 'text') {
      // Whitespace between tags is the template author's indentation, and
      // reproducing it under a second indentation makes a diff unreadable.
      const text = node.value.trim();
      if (text) out.push(pad + text);
      return;
    }
    if (node.type === 'comment') {
      out.push(`${pad}<!--${node.value}-->`);
      return;
    }
    const open = `<${node.tag}${serializeAttrs(node.attrs)}>`;
    if (VOID_ELEMENTS.has(node.tag)) {
      out.push(pad + open);
      return;
    }
    const close = `</${node.tag}>`;
    if (isOpaque(node) || node.children.length === 0) {
      out.push(pad + open + serialize(node.children) + close);
      return;
    }
    if (node.children.length === 1 && node.children[0].type === 'text') {
      out.push(pad + open + node.children[0].value.trim() + close);
      return;
    }
    out.push(pad + open);
    formatNodes(node.children, depth + 1, out);
    out.push(pad + close);
  });
};

/**
 * Pretty print rendered HTML so a snapshot diff reads as a tree rather than
 * as one very long line.
 *
 * Both sides of every comparison go through this, so the formatting is part
 * of what is compared and never the reason two runs disagree. It is lossy in
 * one way only: whitespace that sits alone between two tags is dropped, since
 * that whitespace is template indentation and not content.
 *
 * Unparseable input is returned unchanged rather than thrown over. A snapshot
 * of markup nobody can parse is still worth having.
 *
 * @param {string} html
 * @returns {string} formatted HTML, newline terminated
 */
export function formatHTML(html) {
  const source = String(html == null ? '' : html);
  if (!source) return '';
  let nodes;
  try {
    nodes = parseHTML(source, 'snapshot', { lenient: true });
  } catch (err) {
    return source.endsWith('\n') ? source : `${source}\n`;
  }
  const out = [];
  formatNodes(nodes, 0, out);
  return out.length ? `${out.join('\n')}\n` : '';
}
