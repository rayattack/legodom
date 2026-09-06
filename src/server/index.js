/**
 * lego-dom/server: render LegoDOM blocks to HTML strings, in Node.
 *
 *   import { createRenderer } from 'lego-dom/server';
 *
 *   const renderer = createRenderer();
 *   renderer.defineLegoFile(source, 'user-card.lego');
 *   const html = renderer.renderToString('user-card', { props: { name: 'Ada' } });
 *
 * The output is real markup a browser paints before any JavaScript arrives.
 * Every block host carries `b-hydrate` and `b-id`, and a shadow block's
 * template ships as a declarative `<template shadowrootmode="open">`, so the
 * client has everything it needs to take over. See docs/tutorial/ssr.md for
 * the full output contract.
 *
 * This module and everything it imports is DOM free. Only the pure utilities
 * are reachable from here: expression.js, parser-utils.js, helpers.js and
 * lru-cache.js. Nothing from core/ or features/, so importing it in a bare
 * Node process is safe.
 */
import { parseLego } from '../utils/parser-utils.js';
import { config } from '../utils/helpers.js';
import { parseHTML, serialize, escapeAttr } from './html.js';
import { scopeStyles } from './css.js';
import { sanitizeHTML } from './sanitize.js';
import { renderHost, emptySlots, MAX_BLOCK_DEPTH } from './render.js';

export { MAX_BLOCK_DEPTH };

const DELIMITERS = { brackets: ['[[', ']]'], mustache: ['{{', '}}'] };

/** Escape the characters that mean something to a RegExp. */
const escapeForRegex = (raw) => raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Delimiters for a renderer. An explicit `syntax` wins; otherwise the shared
 * `Lego.config.syntax` provides the default, so a project that flipped the
 * client to mustache gets mustache here too. The pair is resolved once, per
 * renderer, rather than read from the global on every interpolation: two
 * renderers with different syntaxes have to coexist in one server process.
 */
const delimitersFor = (syntax) =>
  DELIMITERS[syntax] || DELIMITERS[config.syntax] || DELIMITERS.brackets;

const asText = (value) => (value === undefined || value === null ? '' : String(value));

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

const PROP_IDENT = /^[a-zA-Z_$][\w$]*$/;

/**
 * Parse a `b-props` declaration, in either of the forms the client accepts:
 * `{ age, name }` or `age, name`. Mirrors src/directives/b-props.js.
 */
const parsePropNames = (raw, tagName) => {
  if (Array.isArray(raw)) return raw.slice();
  if (!raw || typeof raw !== 'string') return [];

  let body = raw.trim();
  if (body.startsWith('{') && body.endsWith('}')) body = body.slice(1, -1).trim();
  if (!body) return [];

  const names = body.split(',').map((token) => token.trim()).filter(Boolean);
  const invalid = names.find((token) => !PROP_IDENT.test(token));
  if (!invalid) return names;

  console.error(
    `[Lego SSR] <${tagName}>: invalid b-props token "${invalid}". ` +
    'b-props declares names only, use b-logic or a :prop for values.'
  );
  return [];
};

/**
 * The marker a light DOM block's `<style>` carries. Those styles are global,
 * so every instance of the block emits the same rules; the attribute lets the
 * client find them and keep one.
 */
const STYLE_MARKER = 'data-lego-style';

/** `<template ...>` open tag of a .lego source, quotes respected. */
const LEGO_TEMPLATE_TAG = /<template\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;
const SHADOW_ATTR = /b-shadow\s*=\s*["']?([^"'\s>]*)/i;

/**
 * A .lego file opts out of shadow DOM with `<template b-shadow="false">`.
 * parseLego does not surface that attribute, and parser-utils.js is off
 * limits to this phase, so read it from the source here.
 */
const shadowFromLegoSource = (source) => {
  const tag = source.match(LEGO_TEMPLATE_TAG);
  if (!tag) return true;
  const attr = tag[1].match(SHADOW_ATTR);
  return !attr || attr[1] !== 'false';
};

const DEFAULT_EXPORT = /export\s+default\s+(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*({[\s\S]*})/;

/** The `$db` a script section sees on the server: present, and inert. */
const serverDb = () => ({ get: () => null });

/**
 * Evaluate the `<script>` section of a .lego file.
 *
 * This is the one place the server compiles source text, and it mirrors what
 * src/core/parser.js does in the browser. The code is the block author's own,
 * running on the author's server, from a file the author's build put there.
 * Template expressions never take this path: they are compiled to closures by
 * expression.js, and no `new Function` is involved.
 *
 * Only the default exported object literal is evaluated, so `import`
 * statements in the script section are not supported. Keep server rendered
 * blocks' script sections to a self contained object.
 */
const evaluateScript = (script, blockName) => {
  if (!script) return {};
  const trimmed = script.trim();
  const match = trimmed.match(DEFAULT_EXPORT);
  const code = match ? match[1] : trimmed;
  try {
    return new Function('$db', `return (${code})`)(serverDb) || {};
  } catch (err) {
    throw new Error(
      `[Lego SSR] <${blockName}>: failed evaluating the script section: ${err.message}`,
      { cause: err }
    );
  }
};

/* ------------------------------------------------------------------ *
 * Slots
 * ------------------------------------------------------------------ */

/**
 * Put `slot="name"` on the top level elements of a named slot fragment that
 * do not already carry one, so a shadow block's browser side projection
 * finds them. A fragment with no top level element (bare text) is passed
 * through and lands in the default slot.
 */
const stampSlotName = (html, name, label) => {
  let nodes;
  try {
    nodes = parseHTML(html, label, { lenient: true });
  } catch (err) {
    return html;
  }
  return serialize(nodes.map((node) => {
    if (node.type !== 'el') return node;
    if (node.attrs.some(([attrName]) => attrName === 'slot')) return node;
    return { ...node, attrs: node.attrs.concat([['slot', escapeAttr(name)]]) };
  }));
};

/**
 * Turn the caller's `{ default, header, ... }` map into the slot record the
 * renderer walks: `named` fills a light DOM block's `<slot name>` directly,
 * `all` is what a shadow block emits as light children.
 */
const slotsFromOptions = (slots, label) => {
  const record = emptySlots();
  if (!slots) return record;

  const light = [];
  Object.keys(slots).forEach((key) => {
    const html = slots[key];
    if (typeof html !== 'string' || html === '') return;
    if (key === 'default') {
      record.default = html;
      light.unshift(html);
      return;
    }
    record.named.set(key, html);
    light.push(stampSlotName(html, key, label));
  });

  record.all = light.join('');
  return record;
};

/* ------------------------------------------------------------------ *
 * Render context
 * ------------------------------------------------------------------ */

const buildRoute = (route) => ({
  url: '/',
  route: '',
  method: 'GET',
  body: null,
  ...(route || {}),
  params: (route && route.params) || {},
  query: (route && route.query) || {}
});

/**
 * The `$` helpers a template can name. Same names the client puts in front of
 * state in src/utils/safe-eval.js, so lookup order matches. The ones that
 * only mean something in a live document are inert rather than absent, so a
 * template that mentions `$emit` or `$go` renders instead of throwing.
 */
const createHelpers = (route) => ({
  $element: null,
  $ancestors: () => undefined,
  $registry: () => undefined,
  get $route() { return route; },
  get $params() { return route.params || {}; },
  $go: () => {},
  $mount: () => undefined,
  $db: () => ({ get: () => null }),
  $emit: () => {}
});

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Create a server renderer. Renderers are independent: their definitions,
 * delimiters and sanitizer are their own, so one process can serve several.
 *
 * @param {object} [options]
 * @param {'brackets'|'mustache'} [options.syntax] - interpolation delimiters,
 *   defaulting to whatever `Lego.config.syntax` says
 * @param {(html: string, blockName: string) => string} [options.sanitize] -
 *   replacement for the built in `b-html.safe` sanitizer
 * @param {object} [options.definitions] - blocks to register up front. Takes
 *   what `Lego.getDefinitions()` returns, an app itself, a Map, or any plain
 *   `{ tagName: definition }` object.
 */
export function createRenderer(options = {}) {
  const definitions = new Map();
  const [delimiterStart, delimiterEnd] = delimitersFor(options.syntax);
  const delimiterRe = new RegExp(
    `${escapeForRegex(delimiterStart)}(.*?)${escapeForRegex(delimiterEnd)}`,
    'g'
  );
  const sanitize = typeof options.sanitize === 'function' ? options.sanitize : sanitizeHTML;

  const register = (tagName, definition) => {
    const tag = String(tagName).toLowerCase();
    if (!tag.includes('-')) {
      throw new Error(
        `[Lego SSR] Invalid block name "${tagName}". Block names must contain a hyphen, ` +
        'the same rule custom elements follow.'
      );
    }
    const template = definition.template || '';
    const shadow = definition.shadow !== false;
    const styles = definition.styles || '';
    definitions.set(tag, {
      name: tag,
      template,
      nodes: parseHTML(template, tag),
      logic: definition.logic || {},
      shadow,
      propNames: parsePropNames(definition.props, tag),
      css: scopeStyles(styles, tag, shadow),
      // A shadow block's style is already encapsulated and needs no marker.
      styleAttrs: shadow ? '' : ` ${STYLE_MARKER}="${escapeAttr(tag)}"`
    });
    return tag;
  };

  /**
   * Register every block a definitions source names.
   *
   * The source is whatever `app.getDefinitions()` returns, or the app itself,
   * or a Map, or any plain object keyed by tag name. This is how one module
   * of blocks serves both halves of a server rendered page: register them
   * once through the client API in a Node process, hand the app here, and
   * the markup this renderer produces is the markup that client hydrates.
   */
  const defineAll = (source) => {
    if (!source) return renderer;
    if (typeof source.getDefinitions === 'function') return defineAll(source.getDefinitions());
    const entries = source instanceof Map ? [...source.entries()] : Object.entries(source);
    entries.forEach(([tagName, definition]) => renderer.define(tagName, definition));
    return renderer;
  };

  const renderer = {
    /**
     * Register a block.
     *
     * @param {string} tagName - the custom element name, hyphen required
     * @param {object} definition
     * @param {string} definition.template - the block's markup
     * @param {object} [definition.logic] - state, getters and methods
     * @param {string} [definition.styles] - CSS text for the block's <style>
     * @param {boolean} [definition.shadow=true] - false renders light DOM
     * @param {string|string[]} [definition.props] - declared prop names
     */
    define(tagName, definition = {}) {
      register(tagName, definition);
      return renderer;
    },

    /**
     * Register a block from .lego source. The template, style and script
     * sections are split by the same `parseLego` the client and the Vite
     * plugin use, and the script's default export is evaluated.
     *
     * @param {string} source - .lego file contents
     * @param {string} [filename] - used to derive the block name
     */
    defineLegoFile(source, filename = 'block.lego') {
      // parseLego derives the block name from the filename and throws when it
      // has no hyphen, so `blockName` is always a valid custom element name.
      const parsed = parseLego(source, filename);
      const blockName = parsed.blockName;
      register(blockName, {
        template: parsed.template,
        logic: evaluateScript(parsed.script, blockName),
        styles: parsed.style,
        props: parsed.propsAttr,
        shadow: shadowFromLegoSource(source)
      });
      return renderer;
    },

    /**
     * Register every block a definitions source holds. See the `definitions`
     * option on createRenderer for the shapes accepted.
     *
     * @param {object} source - an app, `app.getDefinitions()`, a Map, or a
     *   plain `{ tagName: definition }` object
     */
    defineFrom(source) {
      return defineAll(source);
    },

    /** Whether a block is registered under this name. */
    has(tagName) {
      return definitions.has(String(tagName).toLowerCase());
    },

    /** Every registered block name. */
    names() {
      return [...definitions.keys()];
    },

    /**
     * Render one block to an HTML string.
     *
     * @param {string} tagName - a registered block name
     * @param {object} [renderOptions]
     * @param {object} [renderOptions.props] - layered over the block's logic
     * @param {object} [renderOptions.globals] - what templates read as `global`
     * @param {object} [renderOptions.route] - what `$route` and `$params` return
     * @param {Record<string,string>} [renderOptions.slots] - slot content, as HTML
     * @param {Record<string,string|boolean>} [renderOptions.attrs] - extra host attributes
     * @returns {string} HTML
     */
    renderToString(tagName, renderOptions = {}) {
      const tag = String(tagName).toLowerCase();
      const definition = definitions.get(tag);
      if (!definition) {
        throw new Error(
          `[Lego SSR] No block registered as "${tag}". ` +
          'Call define() or defineLegoFile() before rendering it.'
        );
      }

      const route = buildRoute(renderOptions.route);
      const ctx = {
        definitions,
        globals: renderOptions.globals || {},
        route,
        helpers: createHelpers(route),
        delimiterStart,
        delimiterEnd,
        delimiterRe,
        sanitize
      };

      const hostAttrs = Object.entries(renderOptions.attrs || {}).map(([name, value]) =>
        (value === true || value === null ? [name, null] : [name, escapeAttr(asText(value))]));

      const startDepth = 1;
      return renderHost(
        ctx,
        tag,
        definition,
        renderOptions.props || {},
        slotsFromOptions(renderOptions.slots, tag),
        hostAttrs,
        startDepth
      );
    }
  };

  defineAll(options.definitions);

  return renderer;
}

export default { createRenderer, MAX_BLOCK_DEPTH };
