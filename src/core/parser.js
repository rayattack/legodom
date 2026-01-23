import { registry, legoFileLogic, getPrivateData } from './registry.js';
import { config, deriveBlockName } from '../utils/helpers.js';
import { snap } from './lifecycle.js';

export const defineLegoFile = (Lego, content, filename = 'block.lego') => {
  let template = '';
  let script = '{}';
  let stylesAttr = '';
  let cascadeAttr = '';
  let errorAttr = '';
  let style = '';

  let remaining = content;
  // Robust regex from parse-lego.js
  const startTagRegex = /<(template|script|style)\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;

  while (remaining) {
    const match = remaining.match(startTagRegex);
    if (!match) break;

    const tagName = match[1].toLowerCase();
    const attrs = match[2];
    const fullMatch = match[0];
    const startIndex = match.index;

    const closeTag = `</${tagName}>`;
    const contentStart = startIndex + fullMatch.length;
    const contentEnd = remaining.indexOf(closeTag, contentStart);

    if (contentEnd === -1) {
      console.warn(`[Lego] Unclosed <${tagName}> tag in ${filename}`);
      break;
    }

    const innerContent = remaining.slice(contentStart, contentEnd);

    if (tagName === 'template') {
      template = innerContent.trim();
      const bStylesMatch = attrs.match(/b-stylesheets=["']([^"']+)["']/);
      if (bStylesMatch) stylesAttr = bStylesMatch[1];
      const bCascadeMatch = attrs.match(/b-cascade=["']([^"']+)["']/);
      if (bCascadeMatch) cascadeAttr = bCascadeMatch[1];
      const bErrorMatch = attrs.match(/b-error=["']([^"']+)["']/);
      if (bErrorMatch) errorAttr = bErrorMatch[1];
    } else if (tagName === 'script') {
      // Extract logic from script
      const logic = innerContent.trim();
      const defaultExport = logic.match(/export\s+default\s+({[\s\S]*})/);
      script = defaultExport ? defaultExport[1] : logic;
    } else if (tagName === 'style') {
      style = innerContent.trim();
    }

    remaining = remaining.slice(contentEnd + closeTag.length);
  }

  const name = deriveBlockName(filename);
  // Inject $db helper into the scope
  let logicObj = {};
  try {
    logicObj = new Function('Lego', '$db', `return ${script}`)(Lego, Lego.globals.$db);
  } catch (e) {
    config.onError(e, 'script', name);
  }

  if (style) {
    template = `<style>${style}</style>` + template;
  }

  registry[name] = document.createElement('template');
  registry[name].innerHTML = template;
  registry[name].setAttribute('b-stylesheets', stylesAttr);
  if (cascadeAttr) {
    registry[name].setAttribute('b-cascade', cascadeAttr);
  }
  if (errorAttr) {
    registry[name].setAttribute('b-error', errorAttr);
  }
  legoFileLogic.set(name, logicObj);

  // Upgrade existing elements
  document.querySelectorAll(name).forEach(el => !getPrivateData(el).snapped && snap(el));
};
