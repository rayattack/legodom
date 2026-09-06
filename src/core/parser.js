import { registry, legoFileLogic, getPrivateData, canDefine, definitionEntry } from './registry.js';
import { deriveBlockName } from '../utils/helpers.js';
import { parseLego } from '../utils/parser-utils.js';
import { snap } from './lifecycle.js';
import { bProps } from '../directives/b-props.js';

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

  let logicObj = {};
  if (script) {
    try {
      const trimmed = script.trim();
      // Allow optional block/line comments between `default` and `{`
      const match = trimmed.match(/export\s+default\s+(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*({[\s\S]*})/);
      const code = match ? match[1] : trimmed;
      // Evaluate script in context of Lego and $db
      logicObj = new Function('Lego', '$db', `return ${code}`)(app, app.globals.$db);
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
  document.querySelectorAll(blockName).forEach(el => !getPrivateData(el).snapped && snap(el));
};
