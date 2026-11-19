import { registry, legoFileLogic, getPrivateData, canDefine, definitionEntry } from './registry.js';
import { deriveBlockName } from '../utils/helpers.js';
import { parseLego, scriptFunctionBody } from '../utils/parser-utils.js';
import { snap } from './lifecycle.js';
import { bProps } from '../directives/b-props.js';
import { createBlockElementClass } from './element.js';

/**
 * Define a Lego block from a .lego file
 * @param {object} app - the app the block is defined against. Also what the
 *   file's script section receives as `Lego`.
 * @param {string} content - The content of the .lego file
 * @param {string} [filename='block.lego'] - The filename of the .lego file
 */
export const defineLegoFile = (app, content, filename = 'block.lego') => {
  const parsed = parseLego(content, filename);
  const { blockName, template, script, style, stylesAttr, cascadeAttr, errorAttr, propsAttr, shadowAttr, formAttr } = parsed;

  if (!canDefine(blockName, app)) return;

  // A runtime-loaded file has no bundler behind it, so its script runs as a
  // function body: top-level helpers work, and an `import` is reported
  // through onError instead of being dropped.
  let logicObj = {};
  if (script) {
    try {
      logicObj = new Function('Lego', '$db', scriptFunctionBody(script))(app, app.globals.$db) || {};
    } catch (e) {
      app.config.onError(e, 'script', blockName);
    }
  }

  // The `<style>` section rides on the entry as `css` rather than being
  // spliced into the markup here: the entry prepends it when it builds the
  // element, and `getDefinitions()` can hand the two to the server renderer
  // separately, which is what lets the server scope the CSS itself.
  //
  // `shadow` and `form` are the same two knobs Lego.block takes, kept on the
  // entry because defineLegoFile does not define the custom element: a
  // lazily loaded block's class already exists by now.
  registry[blockName] = definitionEntry({
    name: blockName,
    source: template,
    css: style || '',
    styles: stylesAttr || '',
    cascade: cascadeAttr || '',
    error: errorAttr || '',
    props: propsAttr || '',
    shadow: shadowAttr !== 'false',
    form: !!formAttr
  }, app);
  bProps.register(blockName, propsAttr);

  legoFileLogic.set(blockName, logicObj);

  // Upgrade existing elements. Defining a block is DOM free, so a Node
  // process registering blocks for the server renderer stops here.
  if (typeof document === 'undefined') return;

  // A lazily loaded block already has its class (the loader defined it to
  // catch the first mount). Called directly, nothing has, and without one only
  // the elements on the page right now would ever mount: an instance inside
  // another block's shadow root, or one a b-if adds later, would stay inert.
  if (typeof customElements !== 'undefined' && !customElements.get(blockName)) {
    try {
      customElements.define(blockName, createBlockElementClass(blockName));
    } catch (e) {
      console.warn(`[Lego] Failed to register web component ${blockName}:`, e);
    }
  }
  document.querySelectorAll(blockName).forEach(el => !getPrivateData(el).snapped && snap(el));
};
