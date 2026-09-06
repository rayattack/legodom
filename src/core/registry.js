/**
 * Definition registry and the process-wide element caches.
 *
 * `registry` maps a tag name to its *definition entry*, not to a bare
 * `<template>`. An entry is:
 *
 *   {
 *     name,        // the tag name
 *     template,    // HTMLTemplateElement holding the block markup (lazy)
 *     source,      // that markup as a string, null for a DOM-built entry
 *     css,         // the block's own <style> text, '' if none
 *     app,         // the app that defined the block (Lego.createApp())
 *     logic,       // template-level b-logic / b-data source, '' if none
 *     props,       // b-props source, '' if none
 *     styles,      // b-stylesheets source, '' if none
 *     cascade,     // b-cascade source, '' if none
 *     cascadeList, // cascade split into keys, [] if none
 *     error,       // b-error tag name, '' if none
 *     shadow,      // false when the block renders into the light DOM
 *     form         // true when the block is form associated
 *   }
 *
 * `template` is a getter. A definition made in JavaScript or parsed from a
 * `.lego` file keeps its markup as `source` and only builds the element the
 * first time something asks for it, which is what lets `Lego.block()` and
 * `Lego.defineLegoFile()` run in a Node process with no `document`. The
 * element is cached on the entry from then on.
 *
 * The entry is how an element finds its app: `snap()` reads
 * `getDefinition(tag).app` and stores it on the element's private data, and
 * everything downstream (delimiters, strict mode, globals, routes, onError)
 * is resolved from there.
 *
 * Custom element names are global to the document, so this map is global too:
 * one tag, one definition, one owning app. Everything else here is keyed by
 * object identity or is a process-wide cache, and carries no app semantics.
 */
export const registry = {};
export const proxyCache = new WeakMap();
export const privateData = new WeakMap();
export const forPools = new WeakMap();
export const itemIdMap = new WeakMap(); // Track item IDs without mutating reactive objects
export const activeBlocks = new Set();
export const legoFileLogic = new Map();
export const snapState = { locked: false };

/**
 * The definition entry for a tag, or null when the tag is not registered.
 * The single read path: nothing outside this module should reach into
 * `registry[tag]` for anything but a truthiness test.
 *
 * @param {string} tagName
 * @returns {object|null}
 */
export const getDefinition = (tagName) => registry[tagName] || null;

/**
 * Build the `<template>` element an entry describes. Needs a document, which
 * is why it runs on first use rather than at registration.
 *
 * The block's own `<style>` leads the markup, exactly where an author writes
 * it in a `.lego` file, so `snap()` finds it with a single `querySelector`.
 *
 * @param {object} entry - a definition entry carrying `source`
 * @returns {HTMLTemplateElement}
 */
const materialize = (entry) => {
  const node = document.createElement('template');
  if (entry.name) node.setAttribute('b-id', entry.name);
  node.setAttribute('b-stylesheets', entry.styles);
  if (entry.logic) node.setAttribute('b-logic', entry.logic);
  if (entry.cascade) node.setAttribute('b-cascade', entry.cascade);
  if (entry.error) node.setAttribute('b-error', entry.error);
  if (entry.props) node.setAttribute('b-props', entry.props);
  if (!entry.shadow) node.setAttribute('b-shadow', 'false');
  if (entry.form) node.setAttribute('b-form', '');
  node.innerHTML = (entry.css ? `<style>${entry.css}</style>` : '') + entry.source;
  return node;
};

/**
 * Build a definition entry from plain values.
 *
 * Nothing here touches the DOM: `spec.source` is the block's markup as a
 * string and the `<template>` is built on demand. Pass `spec.node` instead
 * when the caller already holds the element (an inline `<template b-id>`),
 * and the entry uses it as it stands.
 *
 * @param {object} spec - name, source or node, css and the attribute sources
 * @param {object} app - the app that owns the definition
 * @returns {object} the entry, not yet registered
 */
export const definitionEntry = (spec, app) => {
  const cascade = spec.cascade || '';
  let node = spec.node || null;
  const entry = {
    name: spec.name || '',
    app,
    source: spec.source === undefined ? null : spec.source,
    css: spec.css || '',
    logic: spec.logic || '',
    props: spec.props || '',
    styles: spec.styles || '',
    cascade,
    cascadeList: cascade.split(/\s+/).filter(Boolean),
    error: spec.error || '',
    shadow: spec.shadow !== false,
    form: !!spec.form
  };
  Object.defineProperty(entry, 'template', {
    get() {
      if (!node) node = materialize(entry);
      return node;
    },
    enumerable: true,
    configurable: true
  });
  return entry;
};

/**
 * Build a definition entry from the `<template>` that describes the block.
 *
 * This is the DOM path: an inline `<template b-id>` the page author wrote,
 * whose attributes are the entry's attribute sources.
 *
 * @param {HTMLTemplateElement} template
 * @param {object} app - the app that owns the definition
 * @returns {object} the entry, not yet registered
 */
export const definitionFrom = (template, app) => definitionEntry({
  name: template.getAttribute('b-id') || '',
  node: template,
  logic: template.getAttribute('b-logic') || template.getAttribute('b-data') || '',
  props: template.getAttribute('b-props') || '',
  styles: template.getAttribute('b-stylesheets') || '',
  cascade: template.getAttribute('b-cascade') || '',
  error: template.getAttribute('b-error') || '',
  shadow: template.getAttribute('b-shadow') !== 'false',
  form: template.hasAttribute('b-form')
}, app);

/**
 * May `app` define `tagName`?
 *
 * Custom element names are global to the document: `customElements.define`
 * accepts a name once, for the whole page. So the first app to define a tag
 * owns it, and a second app asking for the same name is told rather than
 * silently shadowing (or worse, half-replacing) the first definition. This is
 * a platform constraint, not a Lego policy.
 *
 * @param {string} tagName
 * @param {object} app
 * @returns {boolean} false when another app already owns the tag
 */
export const canDefine = (tagName, app) => {
  const existing = getDefinition(tagName);
  if (!existing || existing.app === app) return true;
  console.warn(
    `[Lego] <${tagName}> is already defined by another app. Custom element ` +
    `names are global to the document, so the first definition wins and this ` +
    `one is ignored. Give the block a different tag name.`
  );
  return false;
};

export const getPrivateData = (el) => {
  if (!privateData.has(el)) {
    privateData.set(el, { snapped: false, bindings: null, bound: false, rendering: false, anchor: null });
  }
  return privateData.get(el);
};
