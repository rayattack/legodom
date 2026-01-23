import { config } from '../utils/helpers.js';
import { registry, activeBlocks } from './registry.js';

export const styleRegistry = new Map();
export let styleConfig = {};

export const setStyleConfig = (cfg) => { styleConfig = cfg; };

export const loadStylesheets = async () => {
  // Pre-load all defined style sets into Constructable Stylesheets
  const loadPromises = Object.entries(styleConfig).map(async ([key, urls]) => {
    const sheets = await Promise.all(urls.map(async (url) => {
      try {
        const response = await fetch(url);
        const cssText = await response.text();
        const sheet = new CSSStyleSheet();
        await sheet.replace(cssText);
        return sheet;
      } catch (e) {
        console.error(`[Lego] Failed to load stylesheet: ${url}`, e);
        return null;
      }
    }));
    styleRegistry.set(key, sheets.filter(s => s !== null));
  });
  await Promise.all(loadPromises);

  // Re-apply stylesheets to blocks that initialized before styleRegistry was populated
  if (config.debug) console.log('[Lego Debug] Re-applying stylesheets to', activeBlocks.size, 'blocks');
  activeBlocks.forEach(block => {
    applyStyles(block);
  });
};

export const applyStyles = (el) => {
  if (!el.shadowRoot && !el._legoShadow) return;
  const shadow = el.shadowRoot || el._legoShadow;
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];

  // Stylesheet Application: Definition + Instance + Inheritance (Cascade)
  // Note: If templateNode is missing, we might be in trouble, but let's assume it exists or fallback
  const defStyles = (templateNode && templateNode.getAttribute('b-stylesheets') || "").split(/\s+/).filter(Boolean);
  const instStyles = (el.getAttribute('b-stylesheets') || "").split(/\s+/).filter(Boolean);

  // Calculate inherited styles from ancestors with b-cascade
  const inheritedStyles = [];
  let parent = el.parentElement || (el.getRootNode ? el.getRootNode().host : null);
  while (parent) {
    // Check instance cascade
    const instCascade = (parent.getAttribute('b-cascade') || "").split(/\s+/).filter(Boolean);
    if (instCascade.length) inheritedStyles.push(...instCascade);

    // Check definition cascade (if parent is a Lego block)
    const pName = parent.tagName ? parent.tagName.toLowerCase() : '';
    if (registry[pName]) {
      const defCascade = (registry[pName].getAttribute('b-cascade') || "").split(/\s+/).filter(Boolean);
      if (defCascade.length) inheritedStyles.push(...defCascade);
    }
    parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
  }

  const explicit = [...new Set([...defStyles, ...instStyles])];
  const inherited = [...new Set(inheritedStyles)]; // Dedup inherited
  const allStyleNames = [...new Set([...inherited, ...explicit])]; // Dedup all

  if (allStyleNames.length > 0) {
    const sheetsToApply = allStyleNames.flatMap(key => styleRegistry.get(key) || []);
    if (sheetsToApply.length > 0) {
      if (config.debug) console.log('[Lego Debug] Applying styles to', el.tagName, '- Names:', allStyleNames, '- Sheets:', sheetsToApply.length);
    }
    if (sheetsToApply.length > 0) {
      shadow.adoptedStyleSheets = [...sheetsToApply];
    }
  }

  // Metadata for DevTools
  el._studsMeta = {
    stylesheets: {
      explicit,
      inherited,
      applied: allStyleNames
    }
  };
}
