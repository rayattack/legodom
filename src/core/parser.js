import { registry, legoFileLogic, getPrivateData } from './registry.js';
import { config, deriveBlockName } from '../utils/helpers.js';
import { parseLego } from '../utils/parser-utils.js';
import { snap } from './lifecycle.js';

export const defineLegoFile = (Lego, content, filename = 'block.lego') => {
  const parsed = parseLego(content, filename);
  const { blockName, template, script, style, stylesAttr, cascadeAttr, errorAttr } = parsed;

  let logicObj = {};
  if (script) {
    try {
      // Evaluate script in context of Lego and $db
      logicObj = new Function('Lego', '$db', `return ${script}`)(Lego, Lego.globals.$db);
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
  if (cascadeAttr) registry[blockName].setAttribute('b-cascade', cascadeAttr);
  if (errorAttr) registry[blockName].setAttribute('b-error', errorAttr);

  legoFileLogic.set(blockName, logicObj);

  // Upgrade existing elements
  document.querySelectorAll(blockName).forEach(el => !getPrivateData(el).snapped && snap(el));
};
