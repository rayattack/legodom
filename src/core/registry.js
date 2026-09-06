/**
 * Definition registry and the process-wide element caches.
 *
 * `registry` maps a tag name to its *definition entry*, not to a bare
 * `<template>`. An entry is:
 *
 *   {
 *     template,    // HTMLTemplateElement holding the block markup
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
 * Build a definition entry from the `<template>` that describes the block.
 *
 * Every definition path (Lego.block, a .lego file, an inline
 * `<template b-id>`) already produces such a template with the block's
 * attributes on it, so reading the entry off the template keeps the three
 * paths from drifting apart.
 *
 * @param {HTMLTemplateElement} template
 * @param {object} app - the app that owns the definition
 * @returns {object} the entry, not yet registered
 */
export const definitionFrom = (template, app) => {
  const cascade = template.getAttribute('b-cascade') || '';
  return {
    template,
    app,
    logic: template.getAttribute('b-logic') || template.getAttribute('b-data') || '',
    props: template.getAttribute('b-props') || '',
    styles: template.getAttribute('b-stylesheets') || '',
    cascade,
    cascadeList: cascade.split(/\s+/).filter(Boolean),
    error: template.getAttribute('b-error') || '',
    shadow: template.getAttribute('b-shadow') !== 'false',
    form: template.hasAttribute('b-form')
  };
};

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
