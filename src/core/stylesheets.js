import { config } from '../utils/helpers.js';
import { registry, activeBlocks } from './registry.js';

export const styleRegistry = new Map();
// Audit fix #17: definition cascades resolved once at registration
// (block() / defineLegoFile()), so per-snap ancestor walks become
// O(1) Map lookups instead of getAttribute + split per ancestor.
export const definitionCascades = new Map(); // tagName -> string[]
export let styleConfig = {};

export const setStyleConfig = (cfg) => { styleConfig = cfg; };

export const loadStylesheets = async () => {
  // Pre-load all defined style sets into Constructable Stylesheets
  const loadPromises = Object.entries(styleConfig).map(async ([key, urls]) => {
    const sheets = await Promise.all(urls.map(async (url) => {
      try {
        if (url instanceof CSSStyleSheet) return url;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
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

/** A block opts out of Shadow DOM with `b-shadow="false"` on its template. */
export const isLightBlock = (tagName) => {
  const templateNode = registry[tagName];
  return !!templateNode && templateNode.getAttribute('b-shadow') === 'false';
};

// One <style> per light-DOM block, however many instances the page mounts.
const injectedLightStyles = new Set();

// CSSOM rule type constants, named so the recursion below reads as intent
// rather than as bare numbers.
const STYLE_RULE = 1;
const MEDIA_RULE = 4;
const SUPPORTS_RULE = 12;

/**
 * Confine one selector to a light-DOM block. `self` (and `:host`, which the
 * shadow path rewrites `self` into) becomes the tag itself; everything else is
 * a descendant of it.
 */
const scopeSelector = (selector, tagName) => {
  const trimmed = selector.trim();
  const replaced = trimmed.replace(/(?<![-\w])(?:self|:host)(?![-\w])/g, tagName);
  if (replaced !== trimmed) return replaced;
  return `${tagName} ${trimmed}`;
};

/**
 * Re-serialize a rule list with every selector scoped. Conditional groups
 * recurse into their own rules; `@keyframes`, `@font-face` and anything else
 * without selectors are copied through untouched, since scoping them would
 * change what they mean.
 */
const scopeRules = (rules, tagName) => {
  let out = '';
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.type === STYLE_RULE) {
      out += `${rule.selectorText.split(',').map(s => scopeSelector(s, tagName)).join(', ')} { ${rule.style.cssText} }\n`;
      continue;
    }
    if (rule.type === MEDIA_RULE || rule.type === SUPPORTS_RULE) {
      const condition = rule.type === MEDIA_RULE ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
      out += `${condition} {\n${scopeRules(rule.cssRules, tagName)}}\n`;
      continue;
    }
    out += `${rule.cssText}\n`;
  }
  return out;
};

/**
 * Move a light-DOM block's <style> into document.head, scoped to its tag.
 *
 * There is no shadow boundary to do the confining, so every selector is
 * rewritten. The injected element is also the parser: appending it gives us a
 * real CSSOM to read, which is far more trustworthy than a regex over the
 * source. If the environment gives us no sheet, the CSS stays as written
 * (global) rather than being dropped.
 *
 * @param {string} tagName - the block being styled
 * @param {HTMLStyleElement} styleEl - the <style> from the rendered template
 */
export const adoptLightStyle = (tagName, styleEl) => {
  const css = styleEl.textContent;
  styleEl.remove();
  if (injectedLightStyles.has(tagName)) return;
  injectedLightStyles.add(tagName);

  const injected = document.createElement('style');
  injected.setAttribute('data-lego-style', tagName);
  injected.textContent = css;
  document.head.appendChild(injected);

  try {
    if (injected.sheet && injected.sheet.cssRules) {
      injected.textContent = scopeRules(injected.sheet.cssRules, tagName);
    }
  } catch (e) {
    console.warn(`[Lego] Could not scope styles for light-DOM block <${tagName}>:`, e);
  }
};

export const applyStyles = (el) => {
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];
  // A light-DOM block has no private root, so its stylesheets are adopted by
  // the document. They are deduplicated on the way in, so two instances of
  // the same block adopt one copy.
  const shadow = el.shadowRoot || el._legoShadow || (isLightBlock(name) ? document : null);
  if (!shadow) return;

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

    // Check definition cascade (if parent is a Lego block) — read from
    // the precomputed map, not from the template attribute.
    const pName = parent.tagName ? parent.tagName.toLowerCase() : '';
    const defCascade = definitionCascades.get(pName);
    if (defCascade && defCascade.length) inheritedStyles.push(...defCascade);
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
    if (sheetsToApply.length > 0 && shadow.adoptedStyleSheets) {
      const existing = shadow.adoptedStyleSheets.filter(s => !sheetsToApply.includes(s));
      shadow.adoptedStyleSheets = [...existing, ...sheetsToApply];
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
