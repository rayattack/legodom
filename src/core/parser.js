import { registry, legoFileLogic, getPrivateData } from './registry.js';
import { config, deriveBlockName } from '../utils/helpers.js';
import { parseLego } from '../utils/parser-utils.js';
import { snap } from './lifecycle.js';
import { bProps } from '../directives/b-props.js';
import { definitionCascades } from './stylesheets.js';

/**
 * Define a Lego block from a .lego file
 * @param {Lego} Lego - The Lego instance
 * @param {string} content - The content of the .lego file
 * @param {string} [filename='block.lego'] - The filename of the .lego file
 */
export const defineLegoFile = (Lego, content, filename = 'block.lego') => {
  const parsed = parseLego(content, filename);
  const { blockName, template, script, style, stylesAttr, cascadeAttr, errorAttr, propsAttr, shadowAttr, formAttr } = parsed;

  let logicObj = {};
  if (script) {
    try {
      const trimmed = script.trim();
      // Allow optional block/line comments between `default` and `{`
      const match = trimmed.match(/export\s+default\s+(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*({[\s\S]*})/);
      const code = match ? match[1] : trimmed;
      // Evaluate script in context of Lego and $db
      logicObj = new Function('Lego', '$db', `return ${code}`)(Lego, Lego.globals.$db);
    } catch (e) {
      config.onError(e, 'script', blockName);
    }
  }

  let finalTemplate = template;
  if (style) {
    finalTemplate = `<style>${style}</style>` + finalTemplate;
  }

  registry[blockName] = document.createElement('template');
  registry[blockName].innerHTML = finalTemplate;

  if (stylesAttr) registry[blockName].setAttribute('b-stylesheets', stylesAttr);
  if (cascadeAttr) {
    registry[blockName].setAttribute('b-cascade', cascadeAttr);
    definitionCascades.set(blockName, cascadeAttr.split(/\s+/).filter(Boolean));
  }
  if (errorAttr) registry[blockName].setAttribute('b-error', errorAttr);
  if (propsAttr) registry[blockName].setAttribute('b-props', propsAttr);
  // Same two knobs Lego.block takes as `shadow` and `form`. defineLegoFile
  // stamps them on the template directly because it does not define the
  // custom element: a lazily loaded block's class already exists by now.
  if (shadowAttr === 'false') registry[blockName].setAttribute('b-shadow', 'false');
  if (formAttr) registry[blockName].setAttribute('b-form', '');
  bProps.register(blockName, propsAttr);

  legoFileLogic.set(blockName, logicObj);

  // Upgrade existing elements
  document.querySelectorAll(blockName).forEach(el => !getPrivateData(el).snapped && snap(el));
};
