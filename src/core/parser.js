import { registry, legoFileLogic, getPrivateData, canDefine, definitionFrom } from './registry.js';
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

  let finalTemplate = template;
  if (style) {
    finalTemplate = `<style>${style}</style>` + finalTemplate;
  }

  const node = document.createElement('template');
  node.innerHTML = finalTemplate;

  if (stylesAttr) node.setAttribute('b-stylesheets', stylesAttr);
  if (cascadeAttr) node.setAttribute('b-cascade', cascadeAttr);
  if (errorAttr) node.setAttribute('b-error', errorAttr);
  if (propsAttr) node.setAttribute('b-props', propsAttr);
  // Same two knobs Lego.block takes as `shadow` and `form`. defineLegoFile
  // stamps them on the template directly because it does not define the
  // custom element: a lazily loaded block's class already exists by now.
  if (shadowAttr === 'false') node.setAttribute('b-shadow', 'false');
  if (formAttr) node.setAttribute('b-form', '');

  registry[blockName] = definitionFrom(node, app);
  bProps.register(blockName, propsAttr);

  legoFileLogic.set(blockName, logicObj);

  // Upgrade existing elements
  document.querySelectorAll(blockName).forEach(el => !getPrivateData(el).snapped && snap(el));
};
